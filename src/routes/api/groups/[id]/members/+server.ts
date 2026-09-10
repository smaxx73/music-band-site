import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import sql from '$lib/server/db'
import { addGroupMember } from '$lib/server/groups'
import { canManageGroup, isAdmin } from '$lib/types'

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })

	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	// Un admin de groupe accède aux membres de son groupe, un admin global à tous.
	if (!canManageGroup(locals.user, id)) {
		return json({ error: "Vous n'administrez pas ce groupe." }, { status: 403 })
	}

	// Le rôle global relève de l'administration des comptes : un admin de groupe
	// ne le voit pas, et on ne le sélectionne pas plutôt que de le masquer ensuite.
	const canSeeGlobalRole = isAdmin(locals.user.role)

	const members = await sql`
		SELECT u.id, u.display_name, ug.role AS group_role, ug.joined_at
			${canSeeGlobalRole ? sql`, u.role AS global_role` : sql``}
		FROM user_groups ug
		JOIN users u ON u.id = ug.user_id
		WHERE ug.group_id = ${id}
		ORDER BY u.display_name
	`
	return json(members)
}

export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })

	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	const body = await request.json()
	const user_id: unknown = body.user_id
	const role: unknown = body.role ?? 'member'

	if (typeof user_id !== 'number' || !Number.isInteger(user_id)) {
		return json({ error: 'user_id invalide.' }, { status: 400 })
	}
	if (role !== 'admin' && role !== 'member') {
		return json({ error: 'Rôle invalide (admin | member).' }, { status: 400 })
	}

	const result = await addGroupMember(locals.user, id, user_id, role)
	if (!result.ok) return json({ error: result.error }, { status: result.status })

	return json(result.value, { status: 201 })
}
