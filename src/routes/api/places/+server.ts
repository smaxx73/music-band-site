import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import { listGroupPlaces } from '$lib/server/places'

// GET — les lieux du groupe actif, proposés à la saisie du lieu d'une session ou d'un
// événement. Tout membre. La liste se gère depuis /group (admins du groupe).
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	return json({ places: await listGroupPlaces(locals.user.current_group_id) })
}
