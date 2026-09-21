import sql from './db'
import { commentsWithReactions } from './comments'
import { listPostsByIds, postReactions } from './posts'
import { listSetlistsByIds } from './setlists'
import type { FeedItem, FeedPage, FeedRecording, ReactionSummary } from '$lib/types'

/**
 * Fil d'actualité du groupe actif : tout ce qui y a été créé, du plus récent au plus
 * ancien, par pages. Une seule requête ordonne toutes les sources, pour qu'un type très
 * actif ne cache jamais les autres ; chaque page est ensuite complétée type par type.
 *
 * Les prises ne s'y montrent pas une à une : celles qu'un même membre dépose le même
 * jour dans une même session forment une seule carte. Une répétition découpée en douze
 * prises est une nouvelle, pas douze.
 *
 * Les commentaires ne sont pas des éléments du fil : ils se lisent sous ce qu'ils
 * discutent, et un commentaire ne fait pas remonter sa cible — le flux « Activité
 * récente » du tableau de bord les signale déjà.
 */

const PAGE_SIZE = 20

type Cursor = { ts: string; key: string }

// Le curseur voyage dans l'URL : il n'est accepté que sous la forme qu'on lui a donnée.
const CURSOR_TS = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?[+-]\d{2}(:\d{2})?$/
const CURSOR_KEY = /^(post|session|recordings|setlist|playlist):\d+$/

export function parseFeedCursor(raw: string | null): Cursor | null | 'invalid' {
	if (!raw) return null
	const sep = raw.lastIndexOf('|')
	const ts = raw.slice(0, sep)
	const key = raw.slice(sep + 1)
	if (sep < 0 || !CURSOR_TS.test(ts) || !CURSOR_KEY.test(key)) return 'invalid'
	return { ts, key }
}

type FeedRow = { kind: FeedItem['kind']; ref_id: number; ids: number[] | null; ts: string; at: string; key: string }

const NO_REACTION: ReactionSummary = { up_count: 0, down_count: 0, up_reactors: [], down_reactors: [], my_reaction: null }

export async function loadFeed(groupId: number, userId: number, before: Cursor | null): Promise<FeedPage> {
	// L'horodatage repasse en texte : un Date JavaScript perdrait les microsecondes, et le
	// curseur ne retrouverait plus sa ligne.
	const rows = await sql<FeedRow[]>`
		WITH feed AS (
			SELECT 'post' AS kind, p.id AS ref_id, NULL::int[] AS ids, p.created_at AS ts
			FROM posts p WHERE p.group_id = ${groupId}
			UNION ALL
			SELECT 'session', s.id, NULL, s.created_at
			FROM sessions s WHERE s.group_id = ${groupId} AND s.created_at IS NOT NULL
			UNION ALL
			SELECT 'recordings', MIN(r.id), ARRAY_AGG(r.id ORDER BY r.created_at, r.id), MAX(r.created_at)
			FROM recordings r
			JOIN sessions s ON s.id = r.session_id
			WHERE s.group_id = ${groupId} AND r.created_at IS NOT NULL
			GROUP BY r.session_id, COALESCE(r.uploaded_by_user_id::text, r.uploaded_by), date_trunc('day', r.created_at)
			UNION ALL
			SELECT 'setlist', sl.id, NULL, sl.created_at
			FROM setlists sl WHERE sl.group_id = ${groupId}
			UNION ALL
			SELECT 'playlist', pl.id, NULL, pl.created_at
			FROM playlists pl WHERE pl.group_id = ${groupId} AND pl.created_at IS NOT NULL
		)
		SELECT
			kind, ref_id, ids, ts::text AS ts,
			to_char(ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS at,
			(kind || ':' || ref_id) COLLATE "C" AS key
		FROM feed
		${before
			? sql`WHERE ts < ${before.ts}::timestamptz
				OR (ts = ${before.ts}::timestamptz AND (kind || ':' || ref_id) COLLATE "C" < ${before.key})`
			: sql``}
		ORDER BY ts DESC, key DESC
		LIMIT ${PAGE_SIZE + 1}
	`

	const page = rows.slice(0, PAGE_SIZE)
	const last = page.at(-1)
	const next = rows.length > PAGE_SIZE && last ? `${last.ts}|${last.key}` : null

	const idsOf = (kind: FeedItem['kind']) => page.filter((r) => r.kind === kind).map((r) => r.ref_id)
	const postIds = idsOf('post')
	const setlistIds = idsOf('setlist')
	const recordingIds = page.filter((r) => r.kind === 'recordings').flatMap((r) => r.ids ?? [])

	const [posts, reactions, postComments, sessions, recordings, setlists, setlistComments, playlists] =
		await Promise.all([
			listPostsByIds(postIds, groupId),
			postReactions(postIds, userId),
			// Une discussion est bornée par la taille du groupe : tout est chargé, la carte
			// n'en montre que la fin.
			Promise.all(postIds.map((id) => commentsWithReactions({ kind: 'post', id, anchorable: false }, userId))),
			loadSessions(idsOf('session'), groupId),
			loadRecordings(recordingIds, groupId),
			listSetlistsByIds(setlistIds, groupId),
			Promise.all(setlistIds.map((id) => commentsWithReactions({ kind: 'setlist', id }, userId))),
			loadPlaylists(idsOf('playlist'), groupId)
		])

	const commentsByPost = new Map(postIds.map((id, i) => [id, postComments[i]]))
	const commentsBySetlist = new Map(setlistIds.map((id, i) => [id, setlistComments[i]]))
	const recordingById = new Map(recordings.map((r) => [r.id, r]))

	const items: FeedItem[] = []
	for (const row of page) {
		const base = { key: row.key, at: row.at }
		switch (row.kind) {
			case 'post': {
				const post = posts.find((p) => p.id === row.ref_id)
				if (!post) break
				items.push({
					...base, kind: 'post', author: post.author, post,
					reactions: reactions.get(post.id) ?? NO_REACTION,
					comments: commentsByPost.get(post.id) ?? []
				})
				break
			}
			case 'session': {
				const s = sessions.find((x) => x.id === row.ref_id)
				if (!s) break
				const { author, ...session } = s
				items.push({ ...base, kind: 'session', author, session })
				break
			}
			case 'recordings': {
				const batch = (row.ids ?? []).map((id) => recordingById.get(id)).filter((r) => r !== undefined)
				const first = batch[0]
				if (!first) break
				items.push({
					...base, kind: 'recordings', author: first.author,
					session: { id: first.session_id, date: first.session_date, type: first.session_type, title: first.session_title },
					recordings: batch.map(
						({ author: _a, session_id: _s, session_date: _d, session_type: _t, session_title: _st, ...rec }) => rec
					)
				})
				break
			}
			case 'setlist': {
				const s = setlists.find((x) => x.id === row.ref_id)
				if (!s) break
				items.push({
					...base, kind: 'setlist', author: s.created_by,
					setlist: {
						id: s.id, name: s.name, description: s.description, song_count: s.song_count,
						total_duration_s: s.total_duration_s, missing_duration_count: s.missing_duration_count,
						song_titles: s.song_titles
					},
					comments: commentsBySetlist.get(s.id) ?? []
				})
				break
			}
			case 'playlist': {
				const p = playlists.find((x) => x.id === row.ref_id)
				if (!p) break
				const { author, ...playlist } = p
				items.push({ ...base, kind: 'playlist', author, playlist })
				break
			}
		}
	}

	return { items, next }
}

// La date d'une session repasse en texte : sérialisée en JSON, une date à minuit locale
// pourrait glisser d'un jour selon le fuseau.
function loadSessions(ids: number[], groupId: number) {
	if (ids.length === 0) return Promise.resolve([])
	return sql<{
		id: number; date: string; type: string; title: string | null; location: string | null
		author: string; song_titles: string[]; recording_count: number
	}[]>`
		SELECT
			s.id, s.date::text AS date, s.type, s.title, s.location,
			COALESCE(MAX(u.display_name), s.created_by) AS author,
			COALESCE(ARRAY_AGG(DISTINCT so.title) FILTER (WHERE so.title IS NOT NULL), ARRAY[]::TEXT[]) AS song_titles,
			COUNT(r.id)::int AS recording_count
		FROM sessions s
		LEFT JOIN users u      ON u.id = s.created_by_user_id
		LEFT JOIN recordings r ON r.session_id = s.id
		LEFT JOIN songs so     ON so.id = r.song_id
		WHERE s.id = ANY(${ids}) AND s.group_id = ${groupId}
		GROUP BY s.id
	`
}

type RecordingRow = FeedRecording & {
	author: string
	session_id: number
	session_date: string
	session_type: string
	session_title: string | null
}

function loadRecordings(ids: number[], groupId: number) {
	if (ids.length === 0) return Promise.resolve([] as RecordingRow[])
	return sql<RecordingRow[]>`
		SELECT
			r.id, r.song_id, so.title AS song_title, r.take, r.duration_s,
			r.file_path IS NOT NULL        AS has_audio,
			r.youtube_video_id IS NOT NULL AS has_video,
			(SELECT COUNT(*)::int FROM comments c WHERE c.recording_id = r.id) AS comment_count,
			COALESCE(u.display_name, r.uploaded_by) AS author,
			s.id AS session_id, s.date::text AS session_date, s.type AS session_type, s.title AS session_title
		FROM recordings r
		JOIN sessions s ON s.id = r.session_id
		JOIN songs so   ON so.id = r.song_id
		LEFT JOIN users u ON u.id = r.uploaded_by_user_id
		WHERE r.id = ANY(${ids}) AND s.group_id = ${groupId}
	`
}

function loadPlaylists(ids: number[], groupId: number) {
	if (ids.length === 0) return Promise.resolve([])
	return sql<{ id: number; name: string; description: string | null; author: string; item_count: number }[]>`
		SELECT
			p.id, p.name, p.description,
			COALESCE(MAX(u.display_name), p.created_by) AS author,
			COUNT(pi.id)::int AS item_count
		FROM playlists p
		LEFT JOIN users u           ON u.id = p.created_by_user_id
		LEFT JOIN playlist_items pi ON pi.playlist_id = p.id
		WHERE p.id = ANY(${ids}) AND p.group_id = ${groupId}
		GROUP BY p.id
	`
}
