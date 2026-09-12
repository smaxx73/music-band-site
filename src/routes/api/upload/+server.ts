import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import { copyFile, unlink } from 'fs/promises'
import sql from '$lib/server/db'
import { convertToMp3, getDuration } from '$lib/server/ffmpeg'
import { audioPath, ensureAudioDir } from '$lib/server/storage'
import { allowedAudioMime, MAX_UPLOAD_SIZE, receiveMultipartAudio } from '$lib/server/upload-stream'
import { notifyGroup } from '$lib/server/notifications'
import type { Recording } from '$lib/types'

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const groupId = locals.user.current_group_id
	const user = locals.user.display_name
	const userId = locals.user.id

	const received = await receiveMultipartAudio(request, {
		allowedMime: await allowedAudioMime(),
		maxSize: MAX_UPLOAD_SIZE
	})
	if (!received.ok) return json({ error: received.error }, { status: received.status })

	const { tmpPath: rawTmpPath, hash: fileHash, fields } = received
	const mp3TmpPath = rawTmpPath + '.mp3'

	const sessionId = parseInt(fields.session_id ?? '')
	const songId = parseInt(fields.song_id ?? '')

	if (!sessionId || isNaN(sessionId)) {
		await unlink(rawTmpPath).catch(() => {})
		return json({ error: 'session_id manquant ou invalide.' }, { status: 400 })
	}
	if (!songId || isNaN(songId)) {
		await unlink(rawTmpPath).catch(() => {})
		return json({ error: 'song_id manquant ou invalide.' }, { status: 400 })
	}

	try {
		// Détection de doublon par hash SHA-256
		const [duplicate] = await sql`
			SELECT r.id, r.take, ses.date AS session_date, s.title AS song_title
			FROM recordings r
			JOIN sessions ses ON ses.id = r.session_id
			JOIN songs s ON s.id = r.song_id
			WHERE r.file_hash = ${fileHash} AND ses.group_id = ${groupId}
		`
		if (duplicate) {
			await unlink(rawTmpPath).catch(() => {})
			return json({ error: 'doublon', duplicate }, { status: 409 })
		}

		// Conversion ffmpeg : disk → disk, jamais en mémoire Node
		await convertToMp3(rawTmpPath, mp3TmpPath)
		await unlink(rawTmpPath).catch(() => {})

		// Durée via ffprobe
		const duration = await getDuration(mp3TmpPath)

		// Transaction : calcul du take + insertion
		const recording = (await sql.begin(async (tx) => {
			// Vérifier que session et morceau existent et appartiennent au groupe actif
			const [song] = await tx<{ id: number; title: string }[]>`
				SELECT id, title FROM songs WHERE id = ${songId} AND group_id = ${groupId}
			`
			if (!song) throw Object.assign(new Error('song_not_found'), { code: 'song_not_found' })

			const [session] = await tx`SELECT id FROM sessions WHERE id = ${sessionId} AND group_id = ${groupId}`
			if (!session) throw Object.assign(new Error('session_not_found'), { code: 'session_not_found' })

			const [{ take }] = await tx`
				SELECT COALESCE(MAX(take), 0) + 1 AS take
				FROM recordings
				WHERE session_id = ${sessionId} AND song_id = ${songId}
			`
			const [rec] = await tx<Recording[]>`
				INSERT INTO recordings (session_id, song_id, take, file_path, duration_s, uploaded_by, uploaded_by_user_id, file_hash)
				VALUES (${sessionId}, ${songId}, ${take}, ${'pending'}, ${duration}, ${user}, ${userId}, ${fileHash})
				RETURNING *
			`
			return { ...rec, song_title: song.title }
		})) as Recording & { song_title: string }

		// /tmp et AUDIO_DIR sont sur des systèmes de fichiers Docker distincts :
		// copier avant de supprimer le fichier temporaire plutôt que d'utiliser rename.
		await ensureAudioDir()
		await copyFile(mp3TmpPath, audioPath(recording.id))
		await unlink(mp3TmpPath).catch(() => {})

		// Mettre à jour file_path
		const filePath = `${recording.id}.mp3`
		await sql`UPDATE recordings SET file_path = ${filePath} WHERE id = ${recording.id}`

		const { song_title, ...created } = recording

		await notifyGroup({
			groupId,
			actor: { id: userId, display_name: user },
			type: 'recording',
			subject: song_title,
			excerpt: `Prise ${created.take}`,
			link: `/recording/${created.id}`,
			recordingId: created.id,
			sessionId: created.session_id
		})

		return json({ ...created, file_path: filePath }, { status: 201 })
	} catch (err: unknown) {
		unlink(rawTmpPath).catch(() => {})
		unlink(mp3TmpPath).catch(() => {})

		const code = (err as { code?: string }).code
		if (code === 'song_not_found') return json({ error: 'Morceau introuvable.' }, { status: 404 })
		if (code === 'session_not_found') return json({ error: 'Session introuvable.' }, { status: 404 })

		console.error('[upload]', err)
		return json({ error: "Erreur lors de l'upload." }, { status: 500 })
	}
}
