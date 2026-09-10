import type { PageServerLoad, Actions } from './$types'
import { error, fail, redirect } from '@sveltejs/kit'
import sql from '$lib/server/db'
import {
	addGroupMember,
	deleteGroup,
	groupDeletionImpact,
	removeGroupMember,
	renameGroup,
	setGroupMemberRole,
	type GroupOpResult
} from '$lib/server/groups'
import { canAssignGroupAdmin, canDeleteGroup } from '$lib/types'

// L'accès à /admin est filtré par admin/+layout.server.ts (admin global).
// Les actions repassent malgré tout par les helpers de $lib/server/groups, qui
// portent les règles fines — notamment la réserve superadmin sur le rôle d'admin de groupe.
export const load: PageServerLoad = async ({ locals, params }) => {
	const id = parseInt(params.id)
	if (isNaN(id)) error(400, 'ID invalide')

	const [group] = await sql`SELECT * FROM groups WHERE id = ${id}`
	if (!group) error(404, 'Groupe introuvable')

	const members = await sql`
		SELECT u.id, u.nickname, u.display_name, u.role AS global_role, ug.role AS group_role, ug.joined_at
		FROM user_groups ug
		JOIN users u ON u.id = ug.user_id
		WHERE ug.group_id = ${id}
		ORDER BY u.display_name
	`

	const allUsers = await sql`
		SELECT id, nickname, display_name, role FROM users WHERE active = true ORDER BY display_name
	`

	// L'impact n'est calculé que pour qui peut réellement supprimer : il coûte un
	// `stat` par fichier audio, inutile à charger pour les autres administrateurs.
	const canDelete = canDeleteGroup(locals.user)
	const deletionImpact = canDelete ? await groupDeletionImpact(id) : null

	return {
		group,
		members,
		allUsers,
		canAssignAdmin: canAssignGroupAdmin(locals.user),
		canDelete,
		deletionImpact
	}
}

function toFail(
	action: string,
	result: Extract<GroupOpResult<never>, { ok: false }>,
	extra: Record<string, unknown> = {}
) {
	return fail(result.status, { action, error: result.error, ...extra })
}

export const actions: Actions = {
	rename: async ({ request, locals, params }) => {
		if (!locals.user) error(403, 'Accès réservé aux administrateurs')

		const id = parseInt(params.id)
		const data = await request.formData()

		const result = await renameGroup(locals.user, id, data.get('name') as string | null)
		if (!result.ok) return toFail('rename', result)
	},

	addMember: async ({ request, locals, params }) => {
		if (!locals.user) error(403, 'Accès réservé aux administrateurs')

		const id = parseInt(params.id)
		const data = await request.formData()
		const userId = parseInt(data.get('user_id') as string)
		const role = (data.get('role') as string) ?? 'member'

		if (isNaN(userId)) return fail(400, { action: 'addMember', error: 'Utilisateur invalide.' })
		if (role !== 'admin' && role !== 'member')
			return fail(400, { action: 'addMember', error: 'Rôle invalide.' })

		const result = await addGroupMember(locals.user, id, userId, role)
		if (!result.ok) return toFail('addMember', result)
	},

	updateRole: async ({ request, locals, params }) => {
		if (!locals.user) error(403, 'Accès réservé aux administrateurs')

		const id = parseInt(params.id)
		const data = await request.formData()
		const userId = parseInt(data.get('user_id') as string)
		const role = data.get('role') as string

		if (isNaN(userId)) return fail(400, { action: 'updateRole', error: 'ID invalide.' })
		if (role !== 'admin' && role !== 'member')
			return fail(400, { action: 'updateRole', error: 'Rôle invalide.' })

		const result = await setGroupMemberRole(locals.user, id, userId, role)
		if (!result.ok) return toFail('updateRole', result, { id: userId })
	},

	removeMember: async ({ request, locals, params }) => {
		if (!locals.user) error(403, 'Accès réservé aux administrateurs')

		const id = parseInt(params.id)
		const data = await request.formData()
		const userId = parseInt(data.get('user_id') as string)

		if (isNaN(userId)) return fail(400, { action: 'removeMember', error: 'ID invalide.' })

		const result = await removeGroupMember(locals.user, id, userId)
		if (!result.ok) return toFail('removeMember', result, { id: userId })
	},

	// Zone dangereuse : superadmin uniquement, et saisie du nom exigée côté serveur.
	deleteGroup: async ({ request, locals, params }) => {
		if (!locals.user) error(403, 'Accès réservé aux administrateurs')

		const id = parseInt(params.id)
		const data = await request.formData()

		const result = await deleteGroup(locals.user, id, data.get('confirmation') as string | null)
		if (!result.ok) return toFail('deleteGroup', result)

		redirect(303, '/admin/groups')
	}
}
