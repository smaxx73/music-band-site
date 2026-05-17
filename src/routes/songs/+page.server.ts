import type { PageServerLoad } from './$types'
import { redirect } from '@sveltejs/kit'
import sql from '$lib/server/db'

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(302, '/login')
	if (!locals.user.current_group_id) return { songs: [] }

	const songs = await sql`
		SELECT s.*, COUNT(r.id)::int AS take_count
		FROM songs s
		LEFT JOIN recordings r ON r.song_id = s.id
		WHERE s.group_id = ${locals.user.current_group_id} AND s.status != 'abandonne'
		GROUP BY s.id
		ORDER BY s.title
	`

	return { songs }
}
