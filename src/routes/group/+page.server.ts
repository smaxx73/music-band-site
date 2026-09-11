import type { PageServerLoad, Actions } from './$types'
import { fail, redirect } from '@sveltejs/kit'
import sql from '$lib/server/db'
import {
	addGroupMember,
	findActiveUserByNickname,
	GROUP_LINK_FIELDS,
	logoRequestTooLarge,
	removeGroupLogo,
	removeGroupMember,
	renameGroup,
	setGroupLogo,
	setGroupMemberRole,
	updateGroupLinks,
	type GroupOpResult
} from '$lib/server/groups'
import { canAssignGroupAdmin, canManageGroup, isAdmin } from '$lib/types'

// Portée sur le groupe actif. Consultation pour tout membre ; gestion des membres,
// du nom et modération pour l'admin du groupe — l'administration transverse
// (créer/supprimer un groupe, tous groupes confondus) reste sur /admin/groups.
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(302, '/login')
	if (!locals.user.current_group_id) {
		return { group: null, members: [], canSeeGlobalRole: false, canManage: false, canAssignAdmin: false }
	}

	const groupId = locals.user.current_group_id

	const [group] = await sql`
		SELECT
			g.*,
			COUNT(DISTINCT ug.user_id)::int  AS member_count,
			COUNT(DISTINCT s.id)::int        AS song_count,
			COUNT(DISTINCT ses.id)::int      AS session_count,
			COUNT(DISTINCT p.id)::int        AS playlist_count,
			floor(EXTRACT(EPOCH FROM gl.updated_at))::float8 AS logo_version
		FROM groups g
		LEFT JOIN group_logos gl  ON gl.group_id  = g.id
		LEFT JOIN user_groups ug  ON ug.group_id  = g.id
		LEFT JOIN songs s         ON s.group_id   = g.id
		LEFT JOIN sessions ses    ON ses.group_id  = g.id
		LEFT JOIN playlists p     ON p.group_id    = g.id
		WHERE g.id = ${groupId}
		GROUP BY g.id, gl.updated_at
	`

	// Le rôle global relève de l'administration des comptes, pas de la vie du groupe :
	// on ne l'expose qu'aux admins, et on ne le sélectionne pas du tout sinon —
	// le masquer côté client le laisserait lisible dans le payload de la page.
	const canSeeGlobalRole = isAdmin(locals.user.role)

	const members = await sql`
		SELECT
			u.id, u.display_name, ug.role AS group_role, ug.joined_at
			${canSeeGlobalRole ? sql`, u.role AS global_role` : sql``}
		FROM user_groups ug
		JOIN users u ON u.id = ug.user_id
		WHERE ug.group_id = ${groupId}
		ORDER BY u.display_name
	`

	return {
		group,
		members,
		canSeeGlobalRole,
		canManage: canManageGroup(locals.user, groupId),
		canAssignAdmin: canAssignGroupAdmin(locals.user)
	}
}

// Les actions n'agissent que sur le groupe actif : l'identifiant vient de la session,
// jamais du formulaire, donc aucun groupe tiers n'est atteignable depuis cette page.
function activeGroup(locals: App.Locals): number | null {
	return locals.user?.current_group_id ?? null
}

function toFail(action: string, result: Extract<GroupOpResult<never>, { ok: false }>, extra: Record<string, unknown> = {}) {
	return fail(result.status, { action, error: result.error, ...extra })
}

export const actions: Actions = {
	rename: async ({ locals, request }) => {
		const groupId = activeGroup(locals)
		if (!locals.user || !groupId) return fail(403, { action: 'rename', error: 'Aucun groupe actif.' })

		const data = await request.formData()
		const result = await renameGroup(locals.user, groupId, data.get('name') as string | null)
		if (!result.ok) return toFail('rename', result)
	},

	addMember: async ({ locals, request }) => {
		const groupId = activeGroup(locals)
		if (!locals.user || !groupId) return fail(403, { action: 'addMember', error: 'Aucun groupe actif.' })

		const data = await request.formData()
		const nickname = (data.get('nickname') as string | null)?.trim()
		if (!nickname) return fail(400, { action: 'addMember', error: 'Le pseudo est obligatoire.' })

		// Ajout par pseudo exact plutôt que par liste déroulante : un admin de groupe
		// n'a pas à connaître l'annuaire des comptes des autres groupes.
		const user = await findActiveUserByNickname(nickname)
		if (!user) return fail(404, { action: 'addMember', error: 'Aucun compte actif avec ce pseudo.' })

		const result = await addGroupMember(locals.user, groupId, user.id, 'member')
		if (!result.ok) return toFail('addMember', result)

		return { action: 'addMember', added: user.display_name }
	},

	updateRole: async ({ locals, request }) => {
		const groupId = activeGroup(locals)
		if (!locals.user || !groupId) return fail(403, { action: 'updateRole', error: 'Aucun groupe actif.' })

		const data = await request.formData()
		const userId = parseInt(data.get('user_id') as string)
		const role = data.get('role') as string

		if (isNaN(userId)) return fail(400, { action: 'updateRole', error: 'ID invalide.' })
		if (role !== 'admin' && role !== 'member')
			return fail(400, { action: 'updateRole', error: 'Rôle invalide.' })

		const result = await setGroupMemberRole(locals.user, groupId, userId, role)
		if (!result.ok) return toFail('updateRole', result, { id: userId })
	},

	removeMember: async ({ locals, request }) => {
		const groupId = activeGroup(locals)
		if (!locals.user || !groupId) return fail(403, { action: 'removeMember', error: 'Aucun groupe actif.' })

		const data = await request.formData()
		const userId = parseInt(data.get('user_id') as string)
		if (isNaN(userId)) return fail(400, { action: 'removeMember', error: 'ID invalide.' })

		const result = await removeGroupMember(locals.user, groupId, userId)
		if (!result.ok) return toFail('removeMember', result, { id: userId })
	},

	updateLinks: async ({ locals, request }) => {
		const groupId = activeGroup(locals)
		if (!locals.user || !groupId) return fail(403, { action: 'updateLinks', error: 'Aucun groupe actif.' })

		const data = await request.formData()
		const links = Object.fromEntries(
			GROUP_LINK_FIELDS.map((field) => [field, (data.get(field) as string | null) ?? ''])
		)
		const result = await updateGroupLinks(locals.user, groupId, links)
		// Les saisies sont renvoyées pour ne pas faire retaper les trois champs sur une erreur.
		if (!result.ok) return toFail('updateLinks', result, { links })

		return { action: 'updateLinks', saved: true }
	},

	uploadLogo: async ({ locals, request }) => {
		const groupId = activeGroup(locals)
		if (!locals.user || !groupId) return fail(403, { action: 'uploadLogo', error: 'Aucun groupe actif.' })
		if (logoRequestTooLarge(request)) {
			return fail(413, { action: 'uploadLogo', error: 'Le logo ne peut pas dépasser 2 Mo.' })
		}

		const data = await request.formData()
		const result = await setGroupLogo(locals.user, groupId, data.get('logo'))
		if (!result.ok) return toFail('uploadLogo', result)
	},

	removeLogo: async ({ locals }) => {
		const groupId = activeGroup(locals)
		if (!locals.user || !groupId) return fail(403, { action: 'removeLogo', error: 'Aucun groupe actif.' })

		const result = await removeGroupLogo(locals.user, groupId)
		if (!result.ok) return toFail('removeLogo', result)
	}
}
