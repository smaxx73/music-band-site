import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import { markNotification, unreadCount } from '$lib/server/notifications'

// PATCH /api/notifications/[id] { read: boolean } → marquer lue / non lue
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	const groupId = locals.user.current_group_id
	if (!groupId) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	const body = await request.json().catch(() => null)
	if (typeof body?.read !== 'boolean') {
		return json({ error: 'read doit être un booléen.' }, { status: 400 })
	}

	// `markNotification` filtre sur le destinataire : une notification d'un autre
	// membre est introuvable, pas interdite — on n'en révèle pas l'existence.
	const notification = await markNotification(locals.user.id, id, body.read)
	if (!notification) return json({ error: 'Notification introuvable.' }, { status: 404 })

	return json({ notification, unread_count: await unreadCount(locals.user.id, groupId) })
}
