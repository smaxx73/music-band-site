import type { PageServerLoad } from './$types'
import { redirect } from '@sveltejs/kit'
import sql from '$lib/server/db'
import { loginRedirect } from '$lib/redirect'

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(302, loginRedirect(url))
	// Sans groupe actif, seul l'espace perso peut recevoir l'enregistrement.
	const currentGroup = locals.user.groups.find((g) => g.id === locals.user?.current_group_id) ?? null
	if (!locals.user.current_group_id) return { sessions: [], songs: [], currentGroup: null }

	const groupId = locals.user.current_group_id

	const [sessions, songs] = await Promise.all([
		sql`
			SELECT id, date, type, title, location
			FROM sessions
			WHERE group_id = ${groupId}
			ORDER BY date DESC, id DESC
		`,
		sql`
			SELECT s.id, s.title,
			       floor(EXTRACT(EPOCH FROM sc.updated_at) * 1000)::float8 AS cover_version
			FROM songs s
			LEFT JOIN song_covers sc ON sc.song_id = s.id
			WHERE s.group_id = ${groupId} AND s.status != 'abandonne'
			ORDER BY s.title
		`
	])

	return { sessions, songs, currentGroup: currentGroup ? { id: currentGroup.id, name: currentGroup.name } : null }
}
