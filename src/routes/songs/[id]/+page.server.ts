import type { PageServerLoad } from './$types'
import { error, redirect } from '@sveltejs/kit'
import sql from '$lib/server/db'

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) redirect(302, '/login')
	if (!locals.user.current_group_id) error(403, 'Aucun groupe actif')

	const id = parseInt(params.id)
	if (isNaN(id)) error(400, 'ID invalide')

	const [song] = await sql`
		SELECT * FROM songs
		WHERE id = ${id} AND group_id = ${locals.user.current_group_id}
	`
	if (!song) error(404, 'Morceau introuvable')

	const recordings = await sql`
		SELECT
			r.id, r.take, r.status, r.notes, r.duration_s, r.uploaded_by, r.created_at,
			ses.id       AS session_id,
			ses.date     AS session_date,
			ses.location AS session_location,
			COUNT(c.id)::int AS comment_count
		FROM recordings r
		JOIN sessions ses ON ses.id = r.session_id
		LEFT JOIN comments c ON c.recording_id = r.id
		WHERE r.song_id = ${id} AND ses.group_id = ${locals.user.current_group_id}
		GROUP BY r.id, ses.id
		ORDER BY ses.date DESC, r.take ASC
	`

	return { song, recordings }
}
