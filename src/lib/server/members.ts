import sql from './db'
import { AVATAR_VERSION_SQL } from './avatars'
import type { GroupRole } from '$lib/types'

// Page d'un membre (`/members/[id]`) : ce qu'il est et ce qu'il a fait dans le groupe
// actif, et rien d'autre. Son espace perso n'y paraît pas — seulement ce qu'il a publié —,
// ni ce qu'il fait dans ses autres groupes. Un compte qui n'est pas membre du groupe
// actif n'a pas de page ici : `getGroupMember` rend `null`, l'appelant répond 404.

export type GroupMember = {
	id: number
	display_name: string
	nickname: string
	active: boolean
	avatar_version: number | null
	group_role: GroupRole
	instruments: string[]
	joined_at: Date | null
}

export async function getGroupMember(groupId: number, userId: number): Promise<GroupMember | null> {
	const [member] = await sql<GroupMember[]>`
		SELECT
			u.id, u.display_name, u.nickname, u.active,
			${AVATAR_VERSION_SQL} AS avatar_version,
			ug.role AS group_role, ug.instruments, ug.joined_at
		FROM user_groups ug
		JOIN users u ON u.id = ug.user_id
		LEFT JOIN user_avatars ua ON ua.user_id = u.id
		WHERE ug.group_id = ${groupId} AND ug.user_id = ${userId}
	`
	return member ?? null
}

const RECORDINGS_SHOWN = 8
const COMMENTS_SHOWN = 8
const POSTS_SHOWN = 5
const UNAVAILABILITIES_SHOWN = 5

export type MemberRecording = {
	id: number
	song_id: number
	song_title: string
	take: number
	duration_s: number | null
	has_audio: boolean
	has_video: boolean
	comment_count: number
	session_id: number
	session_date: string
	session_type: string
	session_title: string | null
}

export type MemberComment = {
	id: number
	content: string
	created_at: Date
	/** Ce que le commentaire discute, nommé comme dans le fil. */
	target_label: string
	/** Le commentaire lui-même, au repère de la prise s'il en a un. */
	href: string
}

export type MemberPost = {
	id: number
	type: 'recording' | 'youtube' | 'song_suggestion'
	title: string
	message: string | null
	created_at: Date
}

export type MemberUnavailability = { id: number; date: string; title: string | null }

export type MemberActivity = {
	counts: { recordings: number; comments: number; sessions: number; posts: number }
	recordings: MemberRecording[]
	comments: MemberComment[]
	posts: MemberPost[]
	unavailabilities: MemberUnavailability[]
}

export async function memberActivity(groupId: number, userId: number): Promise<MemberActivity> {
	const [[counts], recordings, commentRows, posts, unavailabilities] = await Promise.all([
		sql<MemberActivity['counts'][]>`
			SELECT
				(SELECT COUNT(*)::int FROM recordings r JOIN sessions s ON s.id = r.session_id
				  WHERE s.group_id = ${groupId} AND r.uploaded_by_user_id = ${userId}) AS recordings,
				-- C'est la cible qui dit à quel groupe appartient un commentaire.
				(SELECT COUNT(*)::int FROM comments c
				  LEFT JOIN recordings r ON r.id = c.recording_id
				  LEFT JOIN sessions s   ON s.id = r.session_id
				  LEFT JOIN setlists sl  ON sl.id = c.setlist_id
				  LEFT JOIN posts p      ON p.id = c.post_id
				  WHERE c.author_user_id = ${userId}
				    AND (s.group_id = ${groupId} OR sl.group_id = ${groupId} OR p.group_id = ${groupId})) AS comments,
				(SELECT COUNT(*)::int FROM sessions
				  WHERE group_id = ${groupId} AND created_by_user_id = ${userId}) AS sessions,
				(SELECT COUNT(*)::int FROM posts
				  WHERE group_id = ${groupId} AND author_user_id = ${userId}) AS posts
		`,
		// La date de session repasse en texte : sérialisée en JSON, une date à minuit
		// locale pourrait glisser d'un jour selon le fuseau.
		sql<MemberRecording[]>`
			SELECT
				r.id, r.song_id, so.title AS song_title, r.take, r.duration_s,
				r.file_path IS NOT NULL        AS has_audio,
				r.youtube_video_id IS NOT NULL AS has_video,
				(SELECT COUNT(*)::int FROM comments c WHERE c.recording_id = r.id) AS comment_count,
				s.id AS session_id, s.date::text AS session_date, s.type AS session_type, s.title AS session_title
			FROM recordings r
			JOIN sessions s ON s.id = r.session_id
			JOIN songs so   ON so.id = r.song_id
			WHERE s.group_id = ${groupId} AND r.uploaded_by_user_id = ${userId}
			ORDER BY r.created_at DESC NULLS LAST, r.id DESC
			LIMIT ${RECORDINGS_SHOWN}
		`,
		sql<{
			id: number; content: string; created_at: Date; timestamp_s: number | null
			recording_id: number | null; song_title: string | null; take: number | null
			setlist_id: number | null; setlist_name: string | null
			post_id: number | null; post_title: string | null
		}[]>`
			SELECT
				c.id, c.content, c.created_at, c.timestamp_s,
				r.id AS recording_id, so.title AS song_title, r.take,
				sl.id AS setlist_id, sl.name AS setlist_name,
				p.id AS post_id,
				COALESCE(pr.title, p.youtube_title, p.song_title, 'Publication') AS post_title
			FROM comments c
			LEFT JOIN recordings r           ON r.id = c.recording_id
			LEFT JOIN sessions s             ON s.id = r.session_id
			LEFT JOIN songs so               ON so.id = r.song_id
			LEFT JOIN setlists sl            ON sl.id = c.setlist_id
			LEFT JOIN posts p                ON p.id = c.post_id
			LEFT JOIN personal_recordings pr ON pr.id = p.personal_recording_id
			WHERE c.author_user_id = ${userId}
			  AND (s.group_id = ${groupId} OR sl.group_id = ${groupId} OR p.group_id = ${groupId})
			ORDER BY c.created_at DESC, c.id DESC
			LIMIT ${COMMENTS_SHOWN}
		`,
		sql<MemberPost[]>`
			SELECT
				p.id, p.type, p.message, p.created_at,
				COALESCE(pr.title, p.youtube_title, p.song_title, 'Publication') AS title
			FROM posts p
			LEFT JOIN personal_recordings pr ON pr.id = p.personal_recording_id
			WHERE p.group_id = ${groupId} AND p.author_user_id = ${userId}
			ORDER BY p.created_at DESC, p.id DESC
			LIMIT ${POSTS_SHOWN}
		`,
		// Les indisponibilités ne sont pas groupe-scopées (group_id NULL) : les membres du
		// groupe actif les voient déjà dans l'agenda, la page n'en montre pas plus.
		sql<MemberUnavailability[]>`
			SELECT id, date::text AS date, title
			FROM calendar_events
			WHERE type = 'indisponibilite' AND user_id = ${userId} AND date >= CURRENT_DATE
			ORDER BY date
			LIMIT ${UNAVAILABILITIES_SHOWN}
		`
	])

	const comments = commentRows.map((c): MemberComment => {
		const t = c.timestamp_s !== null ? `?t=${Math.floor(c.timestamp_s)}` : ''
		const [path, label] =
			c.setlist_id !== null
				? [`/setlists/${c.setlist_id}`, `Setlist ${c.setlist_name ?? ''}`]
				: c.post_id !== null
					? [`/posts/${c.post_id}`, c.post_title ?? 'Publication']
					: [`/recording/${c.recording_id}`, `${c.song_title ?? ''} — prise ${c.take ?? ''}`]
		return {
			id: c.id,
			content: c.content,
			created_at: c.created_at,
			target_label: label,
			href: `${path}${c.setlist_id !== null ? '' : t}#comment-${c.id}`
		}
	})

	return { counts, recordings, comments, posts, unavailabilities }
}
