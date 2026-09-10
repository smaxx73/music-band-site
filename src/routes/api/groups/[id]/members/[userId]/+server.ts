import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import { removeGroupMember, setGroupMemberRole } from '$lib/server/groups'

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })

	const groupId = parseInt(params.id)
	const userId = parseInt(params.userId)
	if (isNaN(groupId) || isNaN(userId)) return json({ error: 'ID invalide.' }, { status: 400 })

	const body = await request.json()
	const role: unknown = body.role

	if (role !== 'admin' && role !== 'member') {
		return json({ error: 'Rôle invalide (admin | member).' }, { status: 400 })
	}

	// La réserve superadmin sur le rôle d'admin de groupe est portée par le helper.
	const result = await setGroupMemberRole(locals.user, groupId, userId, role)
	if (!result.ok) return json({ error: result.error }, { status: result.status })

	return json(result.value)
}

export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })

	const groupId = parseInt(params.id)
	const userId = parseInt(params.userId)
	if (isNaN(groupId) || isNaN(userId)) return json({ error: 'ID invalide.' }, { status: 400 })

	const result = await removeGroupMember(locals.user, groupId, userId)
	if (!result.ok) return json({ error: result.error }, { status: result.status })

	return json({ success: true })
}
