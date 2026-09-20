import type { PageServerLoad } from './$types'
import { error, redirect } from '@sveltejs/kit'
import sql from '$lib/server/db'
import { getSetlist, setlistItems } from '$lib/server/setlists'
import { commentsWithReactions } from '$lib/server/comments'
import { retargetActiveGroup } from '$lib/server/group-scope'
import { loginRedirect } from '$lib/redirect'

export const load: PageServerLoad = async ({ locals, params, cookies, url, isDataRequest }) => {
	if (!locals.user) redirect(302, loginRedirect(url))
	if (!locals.user.current_group_id) error(403, 'Aucun groupe actif')

	const id = parseInt(params.id)
	if (isNaN(id)) error(400, 'ID invalide')

	const setlist = await getSetlist(id, locals.user.current_group_id)
	if (!setlist) {
		// Un lien reçu peut viser un autre groupe de l'utilisateur : y basculer plutôt
		// que d'opposer un « introuvable » qui ne dit pas quoi faire.
		await retargetActiveGroup(locals.user, { cookies, url, isDataRequest }, 'setlist', id)
		error(404, 'Setlist introuvable')
	}

	const [items, availableSongs, comments, groupMembers] = await Promise.all([
		setlistItems(id),
		// Un morceau abandonné ne se programme pas, comme il ne s'upload pas.
		sql`
			SELECT
				so.id, so.title, so.composer, so.key, so.status, so.reference_duration_s,
				EXISTS (
					SELECT 1 FROM setlist_items si WHERE si.setlist_id = ${id} AND si.song_id = so.id
				) AS in_setlist
			FROM songs so
			WHERE so.group_id = ${locals.user.current_group_id} AND so.status <> 'abandonne'
			ORDER BY so.title ASC
		`,
		commentsWithReactions({ kind: 'setlist', id }, locals.user.id),
		// Le pseudo est l'identifiant stable utilisé dans la syntaxe @pseudo ; le nom
		// affiché aide à reconnaître les membres qui ont choisi un autre affichage.
		sql<{ id: number; nickname: string; display_name: string }[]>`
			SELECT u.id, u.nickname, u.display_name
			FROM user_groups ug
			JOIN users u ON u.id = ug.user_id
			WHERE ug.group_id = ${locals.user.current_group_id} AND u.active = true
			ORDER BY u.display_name, u.nickname
		`
	])

	return { setlist, items, availableSongs, comments, groupMembers }
}
