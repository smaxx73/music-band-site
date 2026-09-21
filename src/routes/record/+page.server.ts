import type { PageServerLoad } from './$types'
import { redirect } from '@sveltejs/kit'
import sql from '$lib/server/db'
import { loginRedirect } from '$lib/redirect'

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(302, loginRedirect(url))
	if (!locals.user.current_group_id) return { sessions: [], songs: [] }

	const groupId = locals.user.current_group_id

	const [sessions, songs] = await Promise.all([
		sql`
			SELECT id, date, type, title, location
			FROM sessions
			WHERE group_id = ${groupId}
			ORDER BY date DESC, id DESC
		`,
		sql`
			SELECT id, title
			FROM songs
			WHERE group_id = ${groupId} AND status != 'abandonne'
			ORDER BY title
		`
	])

	return { sessions, songs }
}
