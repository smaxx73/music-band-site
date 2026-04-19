import type { RequestHandler } from './$types'
import { dev } from '$app/environment'
import { createReadStream } from 'fs'
import { stat } from 'fs/promises'
import { Readable } from 'stream'
import { join } from 'path'
import { AUDIO_DIR } from '$env/static/private'

export const GET: RequestHandler = async ({ params, request, locals }) => {
	// En production, Nginx sert directement les fichiers audio
	if (!dev) return new Response('Not found', { status: 404 })

	if (!locals.user) return new Response('Non autorisé', { status: 401 })

	// Valide le nom de fichier : uniquement {entier}.mp3, pas de traversal
	const filename = params.id
	if (!/^\d+\.mp3$/.test(filename)) {
		return new Response('Not found', { status: 404 })
	}

	const filePath = join(AUDIO_DIR, filename)

	let fileSize: number
	try {
		const stats = await stat(filePath)
		fileSize = stats.size
	} catch {
		return new Response('Not found', { status: 404 })
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

	// Pas de Range — fichier complet
	const nodeStream = createReadStream(filePath)
	return new Response(Readable.toWeb(nodeStream) as ReadableStream, {
		headers: {
			'Content-Type': 'audio/mpeg',
			'Accept-Ranges': 'bytes',
			'Content-Length': String(fileSize)
		}
	})
}
