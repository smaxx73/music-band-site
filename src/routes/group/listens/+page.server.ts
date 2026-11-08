import type { PageServerLoad } from './$types'
import { error, redirect } from '@sveltejs/kit'
import { groupListens } from '$lib/server/listens'
import { loginRedirect } from '$lib/redirect'
import { canManageGroup } from '$lib/types'

// Pas de pagination dans l'application : au-delà, ce sont de vieilles écoutes.
const MAX_RECORDINGS = 100

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(302, loginRedirect(url))
	const groupId = locals.user.current_group_id
	if (!groupId) redirect(302, '/group')
	if (!canManageGroup(locals.user, groupId)) error(403, 'Accès réservé aux administrateurs du groupe')

	return {
		groupName: locals.user.groups.find((g) => g.id === groupId)?.name ?? null,
		recordings: await groupListens(groupId, MAX_RECORDINGS),
		limit: MAX_RECORDINGS
	}
}
