import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import { searchCatalog } from '$lib/server/deezer'

// Recherche d'un titre dans le catalogue Deezer (`?q=`), pour compléter une reprise.
// Réservée aux comptes : le serveur n'est pas un relais ouvert vers Deezer.
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })

	const result = await searchCatalog(url.searchParams.get('q') ?? '')
	if (!result.ok) return json({ error: result.error }, { status: result.status })
	return json({ results: result.value })
}
