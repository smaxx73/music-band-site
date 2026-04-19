import type { PageServerLoad } from './$types'
import { error, redirect } from '@sveltejs/kit'
import sql from '$lib/server/db'

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) redirect(302, '/login')

	const id = parseInt(params.id)
	if (isNaN(id)) error(400, 'ID invalide')

	const [recording] = await sql`
		SELECT
			r.*,
			s.title      AS song_title,
			s.composer   AS song_composer,
			s.key        AS song_key,
			ses.date     AS session_date,
			ses.location AS session_location
		FROM recordings r
		JOIN songs    s   ON s.id   = r.song_id
		JOIN sessions ses ON ses.id = r.session_id
		WHERE r.id = ${id}
	`

	if (!recording) error(404, 'Prise introuvable')

	const comments = await sql`
		SELECT * FROM comments
		WHERE recording_id = ${id}
		ORDER BY timestamp_s ASC NULLS LAST, created_at ASC
	`

	return {
		recording,
		comments,
		user: locals.user
	}
}
