import type { PageServerLoad } from './$types'
import sql from '$lib/server/db'

export const load: PageServerLoad = async ({ locals }) => {
	// Hors connexion, "/" sert de page d'accueil publique (voir +page.svelte) :
	// pas de redirection, pas de requête sur des données de groupe.
	if (!locals.user) return {}

	const groupId = locals.user.current_group_id

	if (!groupId) {
		return { upcomingItems: [], sessions: [], playlists: [], stats: null, nextEvent: null, recentComments: [] }
	}

	const [upcomingSessions, upcomingGroupEvents, sessions, playlists, statsRows, nextEventRows, recentComments] = await Promise.all([
		sql`
			SELECT
				s.id, s.date, s.location, s.members,
				COUNT(DISTINCT r.song_id)::int                             AS song_count,
				ARRAY_AGG(DISTINCT songs.title ORDER BY songs.title)       AS song_titles
			FROM sessions s
			LEFT JOIN recordings r ON r.session_id = s.id
			LEFT JOIN songs       ON songs.id = r.song_id
			WHERE s.group_id = ${groupId}
			  AND s.date >= CURRENT_DATE
			GROUP BY s.id
			ORDER BY s.date ASC
			LIMIT 3
		`,
		// Événements d'agenda de type session (répétition/concert/studio/autre) pas encore
		// transformés en vraie session — ceux qui le sont déjà sont couverts par la requête
		// ci-dessus et ne doivent pas apparaître deux fois.
		sql`
			SELECT id, date, type, title, location
			FROM calendar_events
			WHERE group_id = ${groupId}
			  AND date >= CURRENT_DATE
			  AND session_id IS NULL
			  AND type IN ('repetition', 'concert', 'studio', 'autre')
			ORDER BY date ASC
			LIMIT 3
		`,
		sql`
			SELECT
				s.id, s.date, s.location, s.members,
				COUNT(DISTINCT r.song_id)::int                             AS song_count,
				ARRAY_AGG(DISTINCT songs.title ORDER BY songs.title)       AS song_titles
			FROM sessions s
			LEFT JOIN recordings r ON r.session_id = s.id
			LEFT JOIN songs       ON songs.id = r.song_id
			WHERE s.group_id = ${groupId}
			  AND s.date < CURRENT_DATE
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
		// Les types repetition/concert/studio/autre sont déjà couverts par "Sessions à venir"
		// ci-dessus (session réelle ou événement d'agenda) : ne pas les reprendre ici, sous
		// peine d'afficher le même événement deux fois sur le tableau de bord.
		sql`
			SELECT id, date, type, title, notes
			FROM calendar_events
			WHERE group_id = ${groupId}
			  AND date >= CURRENT_DATE
			  AND type = 'indisponibilite'
			ORDER BY date ASC
			LIMIT 1
		`,
		sql`
			SELECT
				c.id, COALESCE(u.display_name, c.author) AS author, c.content, c.created_at,
				r.id     AS recording_id,
				so.title AS song_title
			FROM comments c
			JOIN recordings r ON r.id = c.recording_id
			JOIN sessions ses ON ses.id = r.session_id
			JOIN songs so     ON so.id = r.song_id
			LEFT JOIN users u ON u.id = c.author_user_id
			WHERE ses.group_id = ${groupId}
			ORDER BY c.created_at DESC
			LIMIT 5
		`,
	])

	const upcomingItems = [
		...upcomingSessions.map((s) => ({
			kind: 'session' as const,
			id: s.id,
			date: s.date,
			location: s.location,
			title: null as string | null,
			song_count: s.song_count,
			song_titles: s.song_titles,
		})),
		...upcomingGroupEvents.map((e) => ({
			kind: 'event' as const,
			id: e.id,
			date: e.date,
			location: e.location,
			title: e.title as string | null,
			eventType: e.type,
		})),
	]
		.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
		.slice(0, 3)

	return {
		upcomingItems,
		sessions,
		playlists,
		stats: statsRows[0] ?? null,
		nextEvent: nextEventRows[0] ?? null,
		recentComments,
	}
}
