import type { PageServerLoad } from './$types'
import { redirect } from '@sveltejs/kit'
import sql from '$lib/server/db'

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(302, '/login')

	const recentRecordings = await sql`
		SELECT
			r.id, r.take, r.status, r.uploaded_by, r.created_at,
			s.title  AS song_title,
			ses.date AS session_date
		FROM recordings r
		JOIN songs    s   ON s.id   = r.song_id
		JOIN sessions ses ON ses.id = r.session_id
		ORDER BY r.created_at DESC
		LIMIT 10
	`

	return { recentRecordings }
}
