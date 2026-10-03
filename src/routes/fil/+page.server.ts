import type { PageServerLoad } from './$types'
import { error, redirect } from '@sveltejs/kit'
import sql from '$lib/server/db'
import { loadFeed, parseFeedView } from '$lib/server/feed'
import { listPersonalRecordings } from '$lib/server/personal'
import { loginRedirect } from '$lib/redirect'

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(302, loginRedirect(url))
	const groupId = locals.user.current_group_id
	if (!groupId) error(403, 'Aucun groupe actif')
	// Une vue inconnue (lien abîmé) retombe sur tout le fil plutôt que sur une erreur.
	const parsed = parseFeedView(url.searchParams.get('vue'))
	const view = parsed === 'invalid' ? 'all' : parsed

	const [feed, personal, groupMembers] = await Promise.all([
		loadFeed(groupId, locals.user.id, null, view),
		// Ce que « Publier » propose de reprendre de l'espace perso.
		listPersonalRecordings(locals.user.id),
		// Pour les @mentions des commentaires écrits depuis le fil.
		sql<{ id: number; nickname: string; display_name: string }[]>`
			SELECT u.id, u.nickname, u.display_name
			FROM user_groups ug
			JOIN users u ON u.id = ug.user_id
			WHERE ug.group_id = ${groupId} AND u.active = true
			ORDER BY u.display_name, u.nickname
		`
	])

	const groupName = locals.user.groups.find((g) => g.id === groupId)?.name ?? ''
	const publishChoices = personal.map((r) => ({
		id: r.id,
		title: r.title,
		published_here: r.publications.some((p) => p.group_id === groupId),
		has_audio: r.file_path !== null
	}))

	return { feed, view, groupMembers, groupName, publishChoices }
}
