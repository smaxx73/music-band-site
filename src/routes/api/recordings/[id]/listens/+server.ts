import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import { recordListen } from '$lib/server/listens'

// Envoyé par le lecteur partagé quand une écoute est acquise (`src/lib/listen-meter.ts`).
// Plusieurs envois le même jour n'en font qu'une : la ligne est par membre, prise et jour.
export const POST: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	const counted = await recordListen(id, locals.user.current_group_id, locals.user.id)
	if (!counted) return json({ error: 'Prise introuvable.' }, { status: 404 })

	return json({ recording_id: id }, { status: 201 })
}
