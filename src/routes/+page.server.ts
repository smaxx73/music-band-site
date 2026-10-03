import type { PageServerLoad } from './$types'
import sql from '$lib/server/db'
import { listRecentPosts } from '$lib/server/posts'
import { listRecentGroupComments } from '$lib/server/comments'
import { listRecentImports } from '$lib/server/imports'
import { PLACEHOLDER_SONG_PREFIX } from '$lib/songs'

// L'accueil n'est qu'un aperçu de l'activité : trois lignes, le fil montre le reste.
// Trois par source suffisent pour les trois dernières toutes sources confondues.
const ACTIVITY_LIMIT = 3
const UPCOMING_LIMIT = 3
// La vue « Commentaires » de l'activité en montre un peu plus : c'est la discussion
// qu'on vient y rattraper, et ces lignes ne s'affichent que si on les demande.
const COMMENTS_LIMIT = 5

export const load: PageServerLoad = async ({ locals }) => {
	// Hors connexion, "/" sert de page d'accueil publique (voir +page.svelte) :
	// pas de redirection, pas de requête sur des données de groupe.
	if (!locals.user) return {}

	const userId = locals.user.id
	const groupId = locals.user.current_group_id

	// Les découpes laissées en plan suivent l'utilisateur : celles vers l'espace perso
	// se voient quel que soit le groupe actif, comme sur /perso.
	const pendingImportsQuery = Promise.all([
		groupId ? listRecentImports(userId, groupId) : Promise.resolve([]),
		listRecentImports(userId, null),
	]).then(([group, perso]) => [...group, ...perso].filter((i) => i.consumed_at === null).length)

	if (!groupId) {
		return {
			lastSession: null, lastTracks: [], upcomingItems: [], otherUnavailabilities: [],
			playlists: [], setlists: [], posts: [], recentComments: [], recentSessions: [],
			recentRecordings: [], placeholderSongCount: 0, pendingImportCount: await pendingImportsQuery,
		}
	}

	const [
		[lastSession], upcomingSessions, upcomingGroupEvents, playlists, setlists, posts,
		recentComments, recentSessions, recentRecordings, [placeholders], pendingImportCount
	] = await Promise.all([
		// La dernière session qu'on peut réécouter : passée ou du jour, avec au moins une
		// piste audio. Une session sans prise, ou vidéo seule, n'a rien à jouer ici.
		sql`
			SELECT s.id, s.date::text AS date, s.type, s.title, s.location
			FROM sessions s
			WHERE s.group_id = ${groupId}
			  AND s.date <= CURRENT_DATE
			  AND EXISTS (SELECT 1 FROM recordings r WHERE r.session_id = s.id AND r.file_path IS NOT NULL)
			ORDER BY s.date DESC, s.id DESC
			LIMIT 1
		`,
		sql`
			SELECT s.id, s.date::text AS date, s.type, s.title, s.location
			FROM sessions s
			WHERE s.group_id = ${groupId}
			  AND s.date >= CURRENT_DATE
			ORDER BY s.date ASC, s.id ASC
			LIMIT ${UPCOMING_LIMIT + 1}
		`,
		// Événements d'agenda de type session (répétition/concert/studio/autre) pas encore
		// transformés en vraie session — ceux qui le sont déjà sont couverts par la requête
		// ci-dessus et ne doivent pas apparaître deux fois.
		sql`
			SELECT id, date::text AS date, type, title, location
			FROM calendar_events
			WHERE group_id = ${groupId}
			  AND date >= CURRENT_DATE
			  AND session_id IS NULL
			  AND type IN ('repetition', 'concert', 'studio', 'autre')
			ORDER BY date ASC
			LIMIT ${UPCOMING_LIMIT}
		`,
		sql`
			SELECT p.id, p.name, p.created_at, p.updated_at, COUNT(pi.id)::int AS item_count
			FROM playlists p
			LEFT JOIN playlist_items pi ON pi.playlist_id = p.id
			WHERE p.group_id = ${groupId}
			GROUP BY p.id
			ORDER BY COALESCE(p.updated_at, p.created_at) DESC NULLS LAST, p.id DESC
			LIMIT ${ACTIVITY_LIMIT}
		`,
		// Une setlist annonce ce que le groupe prépare : elle figure dans l'activité à sa
		// création, et dans « En préparation » parmi les plus récentes.
		sql`
			SELECT
				sl.id, sl.name, sl.created_at,
				COALESCE(u.display_name, sl.created_by) AS created_by,
				(SELECT COUNT(*)::int FROM setlist_items si WHERE si.setlist_id = sl.id) AS item_count
			FROM setlists sl
			LEFT JOIN users u ON u.id = sl.created_by_user_id
			WHERE sl.group_id = ${groupId}
			ORDER BY sl.created_at DESC, sl.id DESC
			LIMIT ${ACTIVITY_LIMIT}
		`,
		listRecentPosts(groupId, ACTIVITY_LIMIT),
		listRecentGroupComments(groupId, COMMENTS_LIMIT),
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
		// Morceaux créés à la volée sous un titre provisoire : ils ne se renomment que
		// si on les voit s'accumuler. Un morceau abandonné n'attend plus rien.
		sql`
			SELECT COUNT(*)::int AS count
			FROM songs
			WHERE group_id = ${groupId}
			  AND starts_with(title, ${PLACEHOLDER_SONG_PREFIX})
			  AND status IS DISTINCT FROM 'abandonne'
		`,
		pendingImportsQuery,
	])

	const lastTracks = lastSession
		? await sql`
			SELECT
				r.id, r.take, r.duration_s, r.song_id, so.title AS song_title,
				(SELECT COUNT(*)::int FROM comments c WHERE c.recording_id = r.id) AS comment_count
			FROM recordings r
			JOIN songs so ON so.id = r.song_id
			WHERE r.session_id = ${lastSession.id} AND r.file_path IS NOT NULL
			ORDER BY so.title, r.take
		`
		: []

	// La session qu'on vient de réécouter n'est plus « à venir », même datée du jour.
	const upcomingItems = [
		...upcomingSessions
			.filter((s) => s.id !== lastSession?.id)
			.map((s) => ({
				kind: 'session' as const,
				id: s.id as number,
				date: s.date as string,
				type: s.type as string,
				title: s.title as string | null,
				location: s.location as string | null,
			})),
		...upcomingGroupEvents.map((e) => ({
			kind: 'event' as const,
			id: e.id as number,
			date: e.date as string,
			type: e.type as string,
			title: e.title as string | null,
			location: e.location as string | null,
		})),
	]
		.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
		.slice(0, UPCOMING_LIMIT)

	// Indisponibilités des membres : elles n'ont pas de group_id (elles suivent la
	// personne, pas un groupe), d'où le filtre par appartenance comme sur /agenda.
	// Celles d'un jour « à venir » s'affichent sur sa carte — c'est là qu'elles comptent ;
	// les autres restent en une ligne, les plus proches d'abord.
	const upcomingDates = upcomingItems.map((i) => i.date)
	const unavailabilities = await sql<{ id: number; date: string; author: string }[]>`
		SELECT e.id, e.date::text AS date, COALESCE(u.display_name, e.author) AS author
		FROM calendar_events e
		LEFT JOIN users u ON u.id = e.user_id
		WHERE e.type = 'indisponibilite'
		  AND e.date >= CURRENT_DATE
		  AND e.user_id IN (SELECT user_id FROM user_groups WHERE group_id = ${groupId})
		ORDER BY e.date ASC, author ASC
		LIMIT 30
	`
	const absentsByDate = new Map<string, string[]>()
	for (const u of unavailabilities) {
		if (!upcomingDates.includes(u.date)) continue
		const names = absentsByDate.get(u.date) ?? []
		if (!names.includes(u.author)) names.push(u.author)
		absentsByDate.set(u.date, names)
	}
	const otherUnavailabilities = unavailabilities.filter((u) => !upcomingDates.includes(u.date)).slice(0, 4)

	return {
		lastSession: lastSession ?? null,
		lastTracks,
		upcomingItems: upcomingItems.map((i) => ({ ...i, absents: absentsByDate.get(i.date) ?? [] })),
		otherUnavailabilities,
		playlists,
		setlists,
		posts,
		recentComments,
		recentSessions,
		recentRecordings,
		placeholderSongCount: placeholders?.count ?? 0,
		pendingImportCount,
	}
}
