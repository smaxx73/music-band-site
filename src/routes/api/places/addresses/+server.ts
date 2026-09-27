import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import { searchAddresses } from '$lib/server/addresses'

// Adresses de la Base Adresse Nationale (`?q=`), pour compléter un lieu. Réservée aux
// comptes : le serveur n'est pas un relais ouvert vers le service de l'IGN.
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })

	const result = await searchAddresses(url.searchParams.get('q') ?? '')
	if (!result.ok) return json({ error: result.error }, { status: result.status })
	return json({ results: result.value })
}
