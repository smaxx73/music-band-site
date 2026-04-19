import type { PageServerLoad } from './$types'
import { redirect } from '@sveltejs/kit'
import sql from '$lib/server/db'

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(302, '/login')

	const [sessions, playlists] = await Promise.all([
		sql`
			SELECT
				s.id, s.date, s.location, s.members,
				COUNT(DISTINCT r.song_id)::int                             AS song_count,
				ARRAY_AGG(DISTINCT songs.title ORDER BY songs.title)       AS song_titles
			FROM sessions s
			LEFT JOIN recordings r ON r.session_id = s.id
			LEFT JOIN songs       ON songs.id = r.song_id
			GROUP BY s.id
			ORDER BY s.date DESC
			LIMIT 5
		`,
		sql`
			SELECT p.*, COUNT(pi.id)::int AS item_count
			FROM playlists p
			LEFT JOIN playlist_items pi ON pi.playlist_id = p.id
			GROUP BY p.id
			ORDER BY p.updated_at DESC NULLS LAST, p.created_at DESC
		`
	])

	return { sessions, playlists }
}
