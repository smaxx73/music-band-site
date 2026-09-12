import type { RequestHandler } from './$types'
import { loadImport, proxyPath } from '$lib/server/imports'
import { streamAudioFile } from '$lib/server/storage'

/**
 * Sert le **proxy** pour la pré-écoute des segments : quelques Mo au lieu de l'original,
 * pour une écoute qui ne dure que le temps de valider une coupure.
 *
 * Toujours par Node, même en production : ces octets ne sont pas dans AUDIO_DIR et ne
 * passent donc jamais par Caddy — un fichier que personne n'a encore validé n'est
 * lisible que de son déposant.
 */
export const GET: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) return new Response('Non autorisé', { status: 401 })
	if (!locals.user.current_group_id) return new Response('Aucun groupe actif', { status: 403 })

	const audioImport = await loadImport(locals.user.id, locals.user.current_group_id, params.id)
	if (!audioImport) return new Response('Not found', { status: 404 })

	const response = await streamAudioFile(proxyPath(audioImport.id), request)
	return response ?? new Response('Not found', { status: 404 })
}
