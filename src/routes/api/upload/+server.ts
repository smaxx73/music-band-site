import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import { Readable } from 'stream'
import { createWriteStream } from 'fs'
import { unlink, rename } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import busboy from 'busboy'
import sql from '$lib/server/db'
import { convertToMp3, getDuration } from '$lib/server/ffmpeg'
import { audioPath, ensureAudioDir } from '$lib/server/storage'

const ALLOWED_MIME = new Set([
	'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg',
	'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac', 'audio/flac',
	'audio/webm', 'audio/opus', 'audio/x-flac', 'video/mp4', 'video/webm'
])

const MAX_SIZE = 200 * 1024 * 1024

export const POST: RequestHandler = ({ locals, request }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })

	const contentType = request.headers.get('content-type') ?? ''
	if (!contentType.includes('multipart/form-data')) {
		return json({ error: 'Content-Type multipart/form-data attendu.' }, { status: 400 })
	}

	const user = locals.user!.name

	return new Promise<Response>((resolve) => {
		const bb = busboy({
			headers: { 'content-type': contentType },
			limits: { fileSize: MAX_SIZE }
		})

		let sessionId: number | null = null
		let songId: number | null = null
		let rawTmpPath: string | null = null
		let fileWritePromise: Promise<void> | null = null
		let fileTooLarge = false
		let mimeError: string | null = null

		bb.on('field', (name, val) => {
			if (name === 'session_id') sessionId = parseInt(val)
			if (name === 'song_id') songId = parseInt(val)
		})

		bb.on('file', (name, stream, info) => {
			if (name !== 'audio') { stream.resume(); return }

			const mime = info.mimeType.toLowerCase()
			if (!ALLOWED_MIME.has(mime) && !mime.startsWith('audio/')) {
				mimeError = `Type de fichier non supporté : ${info.mimeType}`
				stream.resume()
				return
			}

			rawTmpPath = join(tmpdir(), `band-raw-${randomUUID()}.tmp`)
			const ws = createWriteStream(rawTmpPath)

			stream.on('limit', () => {
				fileTooLarge = true
				ws.destroy()
			})

			fileWritePromise = new Promise<void>((res, rej) => {
				ws.on('finish', res)
				ws.on('error', rej)
				stream.on('error', rej)
			})

			// Streaming vers le disque — jamais en mémoire Node
			stream.pipe(ws)
		})

		bb.on('finish', async () => {
			if (fileTooLarge) {
				if (rawTmpPath) unlink(rawTmpPath).catch(() => {})
				resolve(json({ error: 'Fichier trop volumineux (max 200 Mo).' }, { status: 413 }))
				return
			}
			if (mimeError) {
				resolve(json({ error: mimeError }, { status: 400 }))
				return
			}
			if (!sessionId || isNaN(sessionId)) {
				resolve(json({ error: 'session_id manquant ou invalide.' }, { status: 400 }))
				return
			}
			if (!songId || isNaN(songId)) {
				resolve(json({ error: 'song_id manquant ou invalide.' }, { status: 400 }))
				return
			}
			if (!fileWritePromise || !rawTmpPath) {
				resolve(json({ error: 'Fichier audio manquant (champ "audio" attendu).' }, { status: 400 }))
				return
			}

			const mp3TmpPath = rawTmpPath + '.mp3'

			try {
				// Attendre que l'écriture sur disque soit terminée
				await fileWritePromise

				// Conversion ffmpeg : disk → disk, jamais en mémoire Node
				await convertToMp3(rawTmpPath, mp3TmpPath)
				await unlink(rawTmpPath)

				// Durée via ffprobe
				const duration = await getDuration(mp3TmpPath)

				// Transaction : calcul du take + insertion
				const recording = await sql.begin(async (tx) => {
					// Vérifier que session et morceau existent
					const [song] = await tx`SELECT id FROM songs WHERE id = ${songId}`
					if (!song) throw Object.assign(new Error('song_not_found'), { code: 'song_not_found' })

					const [session] = await tx`SELECT id FROM sessions WHERE id = ${sessionId}`
					if (!session) throw Object.assign(new Error('session_not_found'), { code: 'session_not_found' })

					const [{ take }] = await tx`
						SELECT COALESCE(MAX(take), 0) + 1 AS take
						FROM recordings
						WHERE session_id = ${sessionId} AND song_id = ${songId}
					`
					const [rec] = await tx`
						INSERT INTO recordings (session_id, song_id, take, file_path, duration_s, uploaded_by)
						VALUES (${sessionId}, ${songId}, ${take}, ${'pending'}, ${duration}, ${user})
						RETURNING *
					`
					return rec
				})

				// Déplacer le mp3 vers AUDIO_DIR/{id}.mp3
				await ensureAudioDir()
				const finalPath = audioPath(recording.id as number)
				await rename(mp3TmpPath, finalPath)

				// Mettre à jour file_path
				const filePath = `${recording.id}.mp3`
				await sql`UPDATE recordings SET file_path = ${filePath} WHERE id = ${recording.id}`

				resolve(json({ ...recording, file_path: filePath }, { status: 201 }))
			} catch (err: unknown) {
				unlink(rawTmpPath).catch(() => {})
				unlink(mp3TmpPath).catch(() => {})

				const code = (err as { code?: string }).code
				if (code === 'song_not_found') {
					resolve(json({ error: 'Morceau introuvable.' }, { status: 404 }))
				} else if (code === 'session_not_found') {
					resolve(json({ error: 'Session introuvable.' }, { status: 404 }))
				} else {
					console.error('[upload]', err)
					resolve(json({ error: "Erreur lors de l'upload." }, { status: 500 }))
				}
			}
		})

		bb.on('error', (err) => {
			console.error('[busboy]', err)
			if (rawTmpPath) unlink(rawTmpPath).catch(() => {})
			resolve(json({ error: 'Erreur de parsing multipart.' }, { status: 400 }))
		})

		// Connexion Web ReadableStream → busboy (Node.js stream)
		const nodeStream = Readable.fromWeb(request.body as Parameters<typeof Readable.fromWeb>[0])
		nodeStream.pipe(bb)
	})
}
