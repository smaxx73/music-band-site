import type { PageServerLoad } from './$types'
import { redirect } from '@sveltejs/kit'
import sql from '$lib/server/db'

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(302, '/login')

	const groupId = locals.user.current_group_id

	if (!groupId) {
		return { sessions: [], playlists: [], stats: null, nextEvent: null }
	}

	const [sessions, playlists, statsRows, nextEventRows] = await Promise.all([
		sql`
			SELECT
				s.id, s.date, s.location, s.members,
				COUNT(DISTINCT r.song_id)::int                             AS song_count,
				ARRAY_AGG(DISTINCT songs.title ORDER BY songs.title)       AS song_titles
			FROM sessions s
			LEFT JOIN recordings r ON r.session_id = s.id
			LEFT JOIN songs       ON songs.id = r.song_id
			WHERE s.group_id = ${groupId}
			GROUP BY s.id
			ORDER BY s.date DESC
			LIMIT 5
		`,
		sql`
			SELECT p.*, COUNT(pi.id)::int AS item_count
			FROM playlists p
			LEFT JOIN playlist_items pi ON pi.playlist_id = p.id
			WHERE p.group_id = ${groupId}
			GROUP BY p.id
			ORDER BY p.updated_at DESC NULLS LAST, p.created_at DESC
		`,
		sql`
			SELECT
				(SELECT COUNT(*)::int FROM sessions    WHERE group_id = ${groupId})                                                    AS session_count,
				(SELECT COUNT(*)::int FROM recordings r JOIN sessions s ON s.id = r.session_id WHERE s.group_id = ${groupId})          AS recording_count,
				(SELECT COUNT(*)::int FROM playlists   WHERE group_id = ${groupId})                                                   AS playlist_count
		`,
		sql`
			SELECT id, date, type, title, notes
			FROM calendar_events
			WHERE group_id = ${groupId}
			  AND date >= CURRENT_DATE
			ORDER BY date ASC
			LIMIT 1
		`,
	])

	return {
		sessions,
		playlists,
		stats: statsRows[0] ?? null,
		nextEvent: nextEventRows[0] ?? null,
	}
}
