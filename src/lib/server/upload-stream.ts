import { Readable, Transform } from 'stream'
import { createWriteStream } from 'fs'
import { unlink } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID, createHash } from 'crypto'
import busboy from 'busboy'
import sql from './db'

/**
 * Réception d'un envoi multipart contenant un fichier audio.
 *
 * Le fichier est écrit au fil de l'eau dans un fichier temporaire et haché en
 * passant — jamais chargé en mémoire Node. Partagé par l'upload d'une prise et par
 * le dépôt d'un fichier long à découper, pour que les deux appliquent exactement
 * les mêmes limites de taille et la même liste de types autorisés.
 */

/** Taille maximale d'un fichier audio déposé, prises comme imports à découper. */
export const MAX_UPLOAD_SIZE = 200 * 1024 * 1024

export type ReceivedAudio =
	| {
			ok: true
			/** Fichier temporaire brut — au caller de le supprimer, quoi qu'il advienne. */
			tmpPath: string
			/** SHA-256 du fichier source, tel que stocké dans `recordings.file_hash`. */
			hash: string
			fileName: string
			/** Type déclaré du fichier reçu, déjà validé contre `audio_formats`. */
			mimeType: string
			fields: Record<string, string>
	  }
	| { ok: false; status: number; error: string }

export type ReceiveOptions = {
	allowedMime: Set<string>
	maxSize: number
	/** Nom du champ portant le fichier. */
	fileField?: string
}

export function receiveMultipartAudio(
	request: Request,
	{ allowedMime, maxSize, fileField = 'audio' }: ReceiveOptions
): Promise<ReceivedAudio> {
	const contentType = request.headers.get('content-type') ?? ''
	if (!contentType.includes('multipart/form-data')) {
		return Promise.resolve({
			ok: false,
			status: 400,
			error: 'Content-Type multipart/form-data attendu.'
		})
	}

	const maxMo = Math.round(maxSize / 1024 / 1024)

	return new Promise((resolve) => {
		const bb = busboy({
			headers: { 'content-type': contentType },
			limits: { fileSize: maxSize }
		})

		const fields: Record<string, string> = {}
		let tmpPath: string | null = null
		let fileName = ''
		let mimeType = ''
		let hash = ''
		let writePromise: Promise<void> | null = null
		let tooLarge = false
		let mimeError: string | null = null

		bb.on('field', (name, value) => {
			fields[name] = value
		})

		bb.on('file', (name, stream, info) => {
			if (name !== fileField) { stream.resume(); return }

			const mime = info.mimeType.toLowerCase()
			if (!allowedMime.has(mime)) {
				mimeError = `Type de fichier non supporté : ${info.mimeType}`
				stream.resume()
				return
			}

			fileName = info.filename
			mimeType = mime
			tmpPath = join(tmpdir(), `band-raw-${randomUUID()}.tmp`)
			const ws = createWriteStream(tmpPath)
			const sha256 = createHash('sha256')
			const hashTransform = new Transform({
				transform(chunk: Buffer, _enc, cb) { sha256.update(chunk); this.push(chunk); cb() },
				flush(cb) { hash = sha256.digest('hex'); cb() }
			})

			stream.on('limit', () => {
				tooLarge = true
				ws.destroy()
			})

			writePromise = new Promise<void>((res, rej) => {
				ws.on('finish', res)
				ws.on('error', rej)
				stream.on('error', rej)
			})

			// Streaming vers le disque — jamais en mémoire Node
			stream.pipe(hashTransform).pipe(ws)
		})

		bb.on('finish', async () => {
			if (tooLarge) {
				if (tmpPath) unlink(tmpPath).catch(() => {})
				resolve({ ok: false, status: 413, error: `Fichier trop volumineux (max ${maxMo} Mo).` })
				return
			}
			if (mimeError) {
				resolve({ ok: false, status: 400, error: mimeError })
				return
			}
			if (!writePromise || !tmpPath) {
				resolve({
					ok: false,
					status: 400,
					error: `Fichier audio manquant (champ "${fileField}" attendu).`
				})
				return
			}

			try {
				await writePromise
				resolve({ ok: true, tmpPath, hash, fileName, mimeType, fields })
			} catch (err) {
				console.error('[upload-stream]', err)
				unlink(tmpPath).catch(() => {})
				resolve({ ok: false, status: 500, error: "Erreur lors de la réception du fichier." })
			}
		})

		bb.on('error', (err) => {
			console.error('[busboy]', err)
			if (tmpPath) unlink(tmpPath).catch(() => {})
			resolve({ ok: false, status: 400, error: 'Erreur de parsing multipart.' })
		})

		// Connexion Web ReadableStream → busboy (Node.js stream)
		const nodeStream = Readable.fromWeb(request.body as Parameters<typeof Readable.fromWeb>[0])
		nodeStream.pipe(bb)
	})
}

/** Types MIME audio acceptés, tels que configurés dans `audio_formats`. */
export async function allowedAudioMime(): Promise<Set<string>> {
	const rows = await sql<{ mime_types: string[] }[]>`
		SELECT mime_types FROM audio_formats WHERE enabled = true
	`
	return new Set(rows.flatMap((r) => r.mime_types))
}
