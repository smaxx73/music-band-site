import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import { listNotifications, markAllRead, unreadCount } from '$lib/server/notifications'

// GET /api/notifications?unread=1&limit=20 → { items, unread_count }
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	const groupId = locals.user.current_group_id
	if (!groupId) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const unreadOnly = url.searchParams.get('unread') === '1'

	const rawLimit = url.searchParams.get('limit')
	if (rawLimit !== null && (isNaN(parseInt(rawLimit)) || parseInt(rawLimit) < 1)) {
		return json({ error: 'limit invalide.' }, { status: 400 })
	}

	const [items, unread_count] = await Promise.all([
		listNotifications(locals.user.id, groupId, {
			unreadOnly,
			limit: rawLimit === null ? undefined : parseInt(rawLimit)
		}),
		// Toujours le total non lu du groupe, même quand la liste est filtrée :
		// c'est lui que la pastille du menu affiche.
		unreadCount(locals.user.id, groupId)
	])

	return json({ items, unread_count })
}

// PATCH /api/notifications { read: true } → tout marquer comme lu dans le groupe actif
export const PATCH: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	const groupId = locals.user.current_group_id
	if (!groupId) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const body = await request.json().catch(() => null)
	if (body?.read !== true) {
		return json({ error: 'Seul { "read": true } est accepté ici.' }, { status: 400 })
	}

	const updated = await markAllRead(locals.user.id, groupId)

	return json({ updated, unread_count: 0 })
}
