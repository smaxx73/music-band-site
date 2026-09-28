import type { PageServerLoad } from './$types'
import sql from '$lib/server/db'
import { listRecentPosts } from '$lib/server/posts'
import { listRecentGroupComments } from '$lib/server/comments'

// Huit entrées par source suffisent pour les huit dernières, même après filtrage.
const ACTIVITY_LIMIT = 8

export const load: PageServerLoad = async ({ locals }) => {
	// Hors connexion, "/" sert de page d'accueil publique (voir +page.svelte) :
	// pas de redirection, pas de requête sur des données de groupe.
	if (!locals.user) return {}

	const groupId = locals.user.current_group_id

	if (!groupId) {
		return {
			upcomingItems: [], sessions: [], playlists: [], setlists: [], posts: [],
			stats: null, unavailabilities: [], recentComments: [], recentSessions: [], recentRecordings: []
		}
	}

	const [
		upcomingSessions, upcomingGroupEvents, sessions, playlists, setlists, posts,
		statsRows, unavailabilities, recentComments, recentSessions, recentRecordings
	] = await Promise.all([
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
			ORDER BY COALESCE(p.updated_at, p.created_at) DESC NULLS LAST, p.id DESC
		`,
		// Les dernières setlists créées, pour l'actualité : une setlist annonce ce que le
		// groupe prépare, au même titre qu'une session ou une playlist.
		sql`
			SELECT
				sl.id, sl.name, sl.created_at,
				COALESCE(u.display_name, sl.created_by) AS created_by
			FROM setlists sl
			LEFT JOIN users u ON u.id = sl.created_by_user_id
			WHERE sl.group_id = ${groupId}
			ORDER BY sl.created_at DESC, sl.id DESC
			LIMIT ${ACTIVITY_LIMIT}
		`,
		// Ce que les membres apportent depuis leur espace : enregistrements, vidéos, idées.
		listRecentPosts(groupId, ACTIVITY_LIMIT),
		sql`
			SELECT
				(SELECT COUNT(*)::int FROM sessions    WHERE group_id = ${groupId})                                                    AS session_count,
				(SELECT COUNT(*)::int FROM recordings r JOIN sessions s ON s.id = r.session_id WHERE s.group_id = ${groupId})          AS recording_count,
				(SELECT COUNT(*)::int FROM playlists   WHERE group_id = ${groupId})                                                   AS playlist_count
		`,
		// Indisponibilités des membres : elles n'ont pas de group_id (elles suivent la
		// personne, pas un groupe), d'où le filtre par appartenance comme sur /agenda.
		// Les autres types sont déjà couverts par « À venir » ci-dessus.
		sql`
			SELECT e.id, e.date, COALESCE(u.display_name, e.author) AS author
			FROM calendar_events e
			LEFT JOIN users u ON u.id = e.user_id
			WHERE e.type = 'indisponibilite'
			  AND e.date >= CURRENT_DATE
			  AND e.user_id IN (SELECT user_id FROM user_groups WHERE group_id = ${groupId})
			ORDER BY e.date ASC
			LIMIT 4
		`,
		listRecentGroupComments(groupId, ACTIVITY_LIMIT),
		// L'activité suit la création, quelle que soit la date prévue de la session.
		sql`
			SELECT s.id, s.date::text AS date, s.title, s.location, s.created_at
			FROM sessions s
			WHERE s.group_id = ${groupId} AND s.created_at IS NOT NULL
			ORDER BY s.created_at DESC, s.id DESC
			LIMIT ${ACTIVITY_LIMIT}
		`,
		// Comme dans /fil : les prises d'un membre, d'une session et d'un jour
		// sont une seule nouvelle, datée du dernier dépôt de la série.
		sql`
			SELECT
				s.id AS session_id, s.date::text AS session_date, s.title AS session_title,
				COALESCE(MAX(u.display_name), MAX(r.uploaded_by)) AS author,
				COUNT(*)::int AS recording_count, MAX(r.created_at) AS created_at,
				ARRAY_AGG(DISTINCT so.title ORDER BY so.title) AS song_titles
			FROM recordings r
			JOIN sessions s ON s.id = r.session_id
			JOIN songs so ON so.id = r.song_id
			LEFT JOIN users u ON u.id = r.uploaded_by_user_id
			WHERE s.group_id = ${groupId} AND r.created_at IS NOT NULL
			GROUP BY s.id, COALESCE(r.uploaded_by_user_id::text, r.uploaded_by),
				date_trunc('day', r.created_at)
			ORDER BY MAX(r.created_at) DESC, MIN(r.id) DESC
			LIMIT ${ACTIVITY_LIMIT}
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
		setlists,
		posts,
		stats: statsRows[0] ?? null,
		unavailabilities,
		recentComments,
		recentSessions,
		recentRecordings,
	}
}
