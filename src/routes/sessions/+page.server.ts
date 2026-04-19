import type { PageServerLoad } from './$types'
import { redirect } from '@sveltejs/kit'
import sql from '$lib/server/db'

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(302, '/login')

	const sessions = await sql`
		SELECT
			s.*,
			COUNT(DISTINCT r.song_id)::int AS song_count,
			COUNT(r.id)::int               AS recording_count
		FROM sessions s
		LEFT JOIN recordings r ON r.session_id = s.id
		GROUP BY s.id
		ORDER BY s.date DESC
	`

	return { sessions }
}
