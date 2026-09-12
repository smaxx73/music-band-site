import type { RequestHandler } from './$types'
import { join } from 'path'
import sql from '$lib/server/db'
import { audioDir } from '$lib/server/config'
import { streamAudioFile } from '$lib/server/storage'

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

	const response = await streamAudioFile(join(audioDir(), filename), request)
	return response ?? new Response('Not found', { status: 404 })
}
