import { createReadStream } from 'fs'
import { mkdir, stat } from 'fs/promises'
import { join } from 'path'
import { Readable } from 'stream'
import { createHash } from 'crypto'
import { audioDir } from '$lib/server/config'

export function audioPath(recordingId: number): string {
	return join(audioDir(), `${recordingId}.mp3`)
}

export async function ensureAudioDir(): Promise<void> {
	await mkdir(audioDir(), { recursive: true })
}

/** SHA-256 d'un fichier, lu en flux — le contenu n'est jamais chargé en mémoire. */
export function hashFile(filePath: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const sha256 = createHash('sha256')
		const rs = createReadStream(filePath)
		rs.on('data', (chunk) => sha256.update(chunk))
		rs.on('end', () => resolve(sha256.digest('hex')))
		rs.on('error', reject)
	})
}

/**
 * Sert un mp3 en flux, avec support des requêtes `Range` — sans quoi le navigateur
 * ne sait pas se déplacer dans un fichier long. Partagé par les prises (`/audio/`)
 * et par les fichiers en transit de l'écran de découpe.
 * Retourne `null` si le fichier n'existe pas : au caller de décider du 404.
 */
export async function streamAudioFile(
	filePath: string,
	request: Request
): Promise<Response | null> {
	let fileSize: number
	try {
		fileSize = (await stat(filePath)).size
	} catch {
		return null
	}

	const rangeHeader = request.headers.get('range')

	if (rangeHeader) {
		const match = rangeHeader.match(/bytes=(\d*)-(\d*)/)
		if (!match) {
			return new Response('Range not satisfiable', {
				status: 416,
				headers: { 'Content-Range': `bytes */${fileSize}` }
			})
		}

		const start = match[1] ? parseInt(match[1]) : 0
		const end = match[2] ? parseInt(match[2]) : fileSize - 1

		if (start > end || end >= fileSize) {
			return new Response('Range not satisfiable', {
				status: 416,
				headers: { 'Content-Range': `bytes */${fileSize}` }
			})
		}

		const nodeStream = createReadStream(filePath, { start, end })
		return new Response(Readable.toWeb(nodeStream) as ReadableStream, {
			status: 206,
			headers: {
				'Content-Type': 'audio/mpeg',
				'Accept-Ranges': 'bytes',
				'Content-Range': `bytes ${start}-${end}/${fileSize}`,
				'Content-Length': String(end - start + 1)
			}
		})
	}

	const nodeStream = createReadStream(filePath)
	return new Response(Readable.toWeb(nodeStream) as ReadableStream, {
		headers: {
			'Content-Type': 'audio/mpeg',
			'Accept-Ranges': 'bytes',
			'Content-Length': String(fileSize)
		}
	})
}
