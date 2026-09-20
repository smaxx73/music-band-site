import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'

export const PATCH: RequestHandler = async ({ locals }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })
	return json({ error: 'Les numéros de prise sont globaux par morceau et ne peuvent pas être renumérotés.' }, { status: 409 })
}
