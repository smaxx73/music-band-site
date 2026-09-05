import type { RequestHandler } from './$types'
import { createReadStream } from 'fs'
import { stat } from 'fs/promises'
import { Readable } from 'stream'
import { join } from 'path'
import sql from '$lib/server/db'
import { audioDir } from '$lib/server/config'

export const GET: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) return new Response('Non autorisé', { status: 401 })
	if (!locals.user.current_group_id) return new Response('Aucun groupe actif', { status: 403 })

	// Valide le nom de fichier : uniquement {entier}.mp3, pas de traversal
	const filename = params.id
	if (!/^\d+\.mp3$/.test(filename)) {
		return new Response('Not found', { status: 404 })
	}
	const recordingId = parseInt(filename.slice(0, -4))

	// La protection ne doit pas dépendre du proxy : vérifier l'appartenance de
	// la prise au groupe actif avant d'ouvrir le fichier sur disque.
	const [recording] = await sql`
		SELECT r.id FROM recordings r
		JOIN sessions ses ON ses.id = r.session_id
		WHERE r.id = ${recordingId} AND ses.group_id = ${locals.user.current_group_id}
	`
	if (!recording) return new Response('Not found', { status: 404 })

	const filePath = join(audioDir(), filename)

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
