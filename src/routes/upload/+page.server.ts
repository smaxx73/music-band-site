import type { PageServerLoad } from './$types'
import { redirect } from '@sveltejs/kit'
import sql from '$lib/server/db'

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(302, '/login')
	if (!locals.user.current_group_id) return { sessions: [], songs: [] }

	const groupId = locals.user.current_group_id

	const [sessions, songs] = await Promise.all([
		sql`
			SELECT id, date, location
			FROM sessions
			WHERE group_id = ${groupId}
			ORDER BY date DESC
		`,
		sql`
			SELECT id, title, lyrics, music_notes
			FROM songs
			WHERE group_id = ${groupId} AND status != 'abandonne'
			ORDER BY title
		`
	])

	return { sessions, songs }
}
