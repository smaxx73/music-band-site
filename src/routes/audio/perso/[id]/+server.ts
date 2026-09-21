import type { RequestHandler } from './$types'
import { canListenPersonal, personalAudioPath } from '$lib/server/personal'
import { streamAudioFile } from '$lib/server/storage'

/**
 * Fichier d'un enregistrement perso. Comme `/audio/[id]`, la protection ne dépend pas
 * du proxy : le propriétaire l'écoute, un membre du groupe actif aussi si
 * l'enregistrement y est publié — personne d'autre. Pas besoin de groupe actif pour
 * son propre carnet.
 */
export const GET: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) return new Response('Non autorisé', { status: 401 })

	// Valide le nom de fichier : uniquement {entier}.mp3, pas de traversal
	if (!/^\d+\.mp3$/.test(params.id)) return new Response('Not found', { status: 404 })
	const id = parseInt(params.id.slice(0, -4))

	if (!(await canListenPersonal(id, locals.user))) return new Response('Not found', { status: 404 })

	const response = await streamAudioFile(personalAudioPath(id), request)
	return response ?? new Response('Not found', { status: 404 })
}
