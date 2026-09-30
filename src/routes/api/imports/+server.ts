import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import { randomUUID } from 'crypto'
import { rename, unlink } from 'fs/promises'
import sql from '$lib/server/db'
import { createProxy, extractSegment, getDuration } from '$lib/server/ffmpeg'
import { assertTrimmedAudio, hashWithTrim, readAudioTrim } from '$lib/server/audio-trim'
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
import { findPersonalDuplicate } from '$lib/server/personal'

/**
 * Dépôt d'un fichier long destiné à être découpé en plusieurs prises — ou, avec
 * `destination=perso`, en plusieurs enregistrements de l'espace perso.
 * Rien n'entre dans `recordings` ni dans `personal_recordings` ici : le fichier attend
 * dans la zone de transit que la découpe soit validée depuis `/decoupe/[id]`.
 *
 * L'original est conservé tel quel sauf si l'utilisateur a recadré une prise faite
 * dans le navigateur : dans ce cas, seule la portion retenue rejoint la zone de transit.
 * Un proxy léger porte l'analyse et la préécoute.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })

	const userId = locals.user.id
	const groupId = locals.user.current_group_id

	const received = await receiveMultipartAudio(request, {
		allowedMime: await allowedAudioMime(),
		maxSize: MAX_UPLOAD_SIZE
	})
	if (!received.ok) return json({ error: received.error }, { status: received.status })

	const { tmpPath, hash: sourceHash, fileName, mimeType, fields } = received
	const { trim, error: trimError } = await readAudioTrim(fields, tmpPath)
	if (trimError) {
		await unlink(tmpPath).catch(() => {})
		return json({ error: trimError }, { status: 400 })
	}
	const hash = hashWithTrim(sourceHash, trim)
	const personal = fields.destination === 'perso'

	// L'espace perso ne demande ni groupe ni session : il appartient à son propriétaire.
	let sessionId: number | null = null
	if (!personal) {
		if (!groupId) {
			await unlink(tmpPath).catch(() => {})
			return json({ error: 'Aucun groupe actif.' }, { status: 403 })
		}
		sessionId = parseInt(fields.session_id ?? '')
		if (!sessionId || isNaN(sessionId)) {
			await unlink(tmpPath).catch(() => {})
			return json({ error: 'session_id manquant ou invalide.' }, { status: 400 })
		}
	}

	const id = randomUUID()

	try {
		if (personal) {
			// Comme un dépôt direct dans l'espace : le doublon ne se cherche que chez soi.
			const duplicate = await findPersonalDuplicate(userId, hash)
			if (duplicate) {
				await unlink(tmpPath).catch(() => {})
				return json(
					{ error: `Ce fichier est déjà dans ton espace perso : « ${duplicate.title} ».`, existing_id: duplicate.id },
					{ status: 409 }
				)
			}
		} else {
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
		}

		// Sans cadrage, l'original entre sans transcodage : un seul encodage au total.
		// Un cadrage est appliqué ici, avant l'analyse, pour que les temps affichés
		// sur l'écran de découpe commencent bien à zéro.
		await ensureImportsDir()
		if (trim) {
			// La découpe ultérieure voit seulement la plage choisie et son temps part de zéro.
			await extractSegment(tmpPath, sourcePath(id), trim.startS, trim.endS - trim.startS)
			await assertTrimmedAudio(sourcePath(id), trim)
			await unlink(tmpPath).catch(() => {})
		} else {
			await rename(tmpPath, sourcePath(id))
		}

		// Le proxy, lui, se refabrique à volonté — il ne porte que le travail.
		await createProxy(sourcePath(id), proxyPath(id))

		const created = await createImport({
			id,
			groupId: personal ? null : groupId,
			userId,
			sessionId,
			fileName: cleanSourceFileName(fileName) ?? 'enregistrement',
			sourceMime: trim ? 'audio/mpeg' : mimeType || null,
			fileHash: hash,
			// Sur le proxy, pas l'original : un enregistrement fait dans le navigateur
			// (WebM de MediaRecorder) ne porte pas sa durée, le mp3 du proxy si.
			durationS: await getDuration(proxyPath(id))
		})

		// Ménage des imports abandonnés : personne n'attend son résultat.
		sweepStaleImports()

		return json(created, { status: 201 })
	} catch (err) {
		const invalidTrim = (err as { code?: string }).code === 'invalid_trim'
		console.error('[imports]', err)
		unlink(tmpPath).catch(() => {})
		unlink(sourcePath(id)).catch(() => {})
		unlink(proxyPath(id)).catch(() => {})
		if (invalidTrim) return json({ error: 'La coupe ne contient pas de son.' }, { status: 400 })
		return json({ error: "Erreur lors de la préparation du fichier." }, { status: 500 })
	}
}
