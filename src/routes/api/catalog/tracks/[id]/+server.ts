import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import { catalogTrack } from '$lib/server/deezer'

// Détail d'un titre du catalogue : la recherche ne donne pas l'année de sortie.
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })

	const id = parseInt(params.id)
	if (isNaN(id) || id <= 0) return json({ error: 'ID invalide.' }, { status: 400 })

	const result = await catalogTrack(id)
	if (!result.ok) return json({ error: result.error }, { status: result.status })
	return json(result.value)
}
