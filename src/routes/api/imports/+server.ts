import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import { randomUUID } from 'crypto'
import { rename, unlink } from 'fs/promises'
import sql from '$lib/server/db'
import { createProxy, getDuration } from '$lib/server/ffmpeg'
import {
	allowedAudioMime,
	cleanSourceFileName,
	MAX_UPLOAD_SIZE,
	receiveMultipartAudio
} from '$lib/server/upload-stream'
import {
	createImport,
	ensureImportsDir,
	proxyPath,
	sourcePath,
	sweepStaleImports
} from '$lib/server/imports'

/**
 * Dépôt d'un fichier long destiné à être découpé en plusieurs prises.
 * Rien n'entre dans `recordings` ici : le fichier attend dans la zone de transit que
 * la découpe soit validée depuis `/upload/decoupe/[id]`.
 *
 * L'original est conservé tel quel — c'est lui qui sera taillé. Seul un proxy léger est
 * fabriqué ici, pour porter l'analyse et la préécoute.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const groupId = locals.user.current_group_id

	const received = await receiveMultipartAudio(request, {
		allowedMime: await allowedAudioMime(),
		maxSize: MAX_UPLOAD_SIZE
	})
	if (!received.ok) return json({ error: received.error }, { status: received.status })

	const { tmpPath, hash, fileName, mimeType, fields } = received
	const sessionId = parseInt(fields.session_id ?? '')
	if (!sessionId || isNaN(sessionId)) {
		await unlink(tmpPath).catch(() => {})
		return json({ error: 'session_id manquant ou invalide.' }, { status: 400 })
	}

	const id = randomUUID()

	try {
		const [session] = await sql`
			SELECT id FROM sessions WHERE id = ${sessionId} AND group_id = ${groupId}
		`
		if (!session) {
			await unlink(tmpPath).catch(() => {})
			return json({ error: 'Session introuvable.' }, { status: 404 })
		}

		// Même détection de doublon que pour une prise : le hash porte sur la source.
		const [duplicate] = await sql`
			SELECT r.id, r.take, ses.date AS session_date, s.title AS song_title
			FROM recordings r
			JOIN sessions ses ON ses.id = r.session_id
			JOIN songs s ON s.id = r.song_id
			WHERE r.file_hash = ${hash} AND ses.group_id = ${groupId}
		`
		if (duplicate) {
			await unlink(tmpPath).catch(() => {})
			return json({ error: 'doublon', duplicate }, { status: 409 })
		}

		// L'original entre dans la zone de transit sans être touché : aucun transcodage
		// avant la découpe, donc un seul encodage au total sur le chemin d'une prise.
		// Le fichier temporaire de busboy et la zone de transit vivent tous deux sous
		// le répertoire temporaire : `rename` suffit, sans recopier 200 Mo.
		await ensureImportsDir()
		await rename(tmpPath, sourcePath(id))

		// Le proxy, lui, se refabrique à volonté — il ne porte que le travail.
		await createProxy(sourcePath(id), proxyPath(id))

		const created = await createImport({
			id,
			groupId,
			userId: locals.user.id,
			sessionId,
			fileName: cleanSourceFileName(fileName) ?? 'enregistrement',
			sourceMime: mimeType || null,
			fileHash: hash,
			durationS: await getDuration(sourcePath(id))
		})

		// Ménage des imports abandonnés : personne n'attend son résultat.
		sweepStaleImports()

		return json(created, { status: 201 })
	} catch (err) {
		console.error('[imports]', err)
		unlink(tmpPath).catch(() => {})
		unlink(sourcePath(id)).catch(() => {})
		unlink(proxyPath(id)).catch(() => {})
		return json({ error: "Erreur lors de la préparation du fichier." }, { status: 500 })
	}
}
