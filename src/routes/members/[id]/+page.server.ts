import type { PageServerLoad } from './$types'
import { error, redirect } from '@sveltejs/kit'
import { getGroupMember, memberActivity } from '$lib/server/members'
import { retargetActiveGroupToMember } from '$lib/server/group-scope'
import { loginRedirect } from '$lib/redirect'

// Ce que le membre est et fait dans le groupe actif. Un compte hors du groupe actif n'a
// pas de page ici : 404, jamais 403 — sauf s'il partage un autre groupe avec soi, où
// l'on bascule comme pour tout lien de contenu.
export const load: PageServerLoad = async ({ locals, params, cookies, url, isDataRequest }) => {
	if (!locals.user) redirect(302, loginRedirect(url))
	if (!locals.user.current_group_id) error(403, 'Aucun groupe actif')

	const id = parseInt(params.id)
	if (isNaN(id)) error(400, 'ID invalide')

	const groupId = locals.user.current_group_id
	const member = await getGroupMember(groupId, id)
	if (!member) {
		await retargetActiveGroupToMember(locals.user, { cookies, url, isDataRequest }, id)
		error(404, 'Membre introuvable')
	}

	return {
		member,
		activity: await memberActivity(groupId, id),
		groupName: locals.user.groups.find((g) => g.id === groupId)?.name ?? '',
		isSelf: id === locals.user.id
	}
}
