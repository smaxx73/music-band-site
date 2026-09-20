import sql from '$lib/server/db'
import type { CommentThread, CommentWithReactions, ReactionValue } from '$lib/types'

export type ReactionSummary = {
	up_count: number
	down_count: number
	up_reactors: string[]
	down_reactors: string[]
	my_reaction: ReactionValue | null
}

/**
 * Commentaires d'une discussion — celle d'une prise ou celle d'une setlist —,
 * enrichis des compteurs de pouces et de la réaction de l'utilisateur courant.
 * Le contrôle du groupe est à faire par l'appelant, sur la cible.
 */
export function commentsWithReactions(thread: CommentThread, userId: number) {
	return sql<CommentWithReactions[]>`
		SELECT
			c.id, c.recording_id, c.setlist_id, COALESCE(MAX(u.display_name), c.author) AS author,
			c.author_user_id, c.content, c.timestamp_s, c.created_at, c.edited_at,
			COUNT(cr.user_id) FILTER (WHERE cr.value = 1)::int       AS up_count,
			COUNT(cr.user_id) FILTER (WHERE cr.value = -1)::int      AS down_count,
			COALESCE(
				ARRAY_AGG(reactor.display_name ORDER BY reactor.display_name) FILTER (WHERE cr.value = 1),
				ARRAY[]::TEXT[]
			) AS up_reactors,
			COALESCE(
				ARRAY_AGG(reactor.display_name ORDER BY reactor.display_name) FILTER (WHERE cr.value = -1),
				ARRAY[]::TEXT[]
			) AS down_reactors,
			MAX(cr.value) FILTER (WHERE cr.user_id = ${userId})::int AS my_reaction
		FROM comments c
		LEFT JOIN users u ON u.id = c.author_user_id
		LEFT JOIN comment_reactions cr ON cr.comment_id = c.id
		LEFT JOIN users reactor ON reactor.id = cr.user_id
		WHERE ${thread.kind === 'recording'
			? sql`c.recording_id = ${thread.id}`
			: sql`c.setlist_id = ${thread.id}`}
		GROUP BY c.id
		ORDER BY c.created_at ASC
	`
}

/** Compteurs d'un seul commentaire, après écriture d'une réaction. */
export async function reactionSummary(commentId: number, userId: number): Promise<ReactionSummary> {
	const [row] = await sql<ReactionSummary[]>`
		SELECT
			COUNT(cr.user_id) FILTER (WHERE cr.value = 1)::int       AS up_count,
			COUNT(cr.user_id) FILTER (WHERE cr.value = -1)::int      AS down_count,
			COALESCE(
				ARRAY_AGG(u.display_name ORDER BY u.display_name) FILTER (WHERE cr.value = 1),
				ARRAY[]::TEXT[]
			) AS up_reactors,
			COALESCE(
				ARRAY_AGG(u.display_name ORDER BY u.display_name) FILTER (WHERE cr.value = -1),
				ARRAY[]::TEXT[]
			) AS down_reactors,
			MAX(cr.value) FILTER (WHERE cr.user_id = ${userId})::int AS my_reaction
		FROM comment_reactions cr
		JOIN users u ON u.id = cr.user_id
		WHERE cr.comment_id = ${commentId}
	`
	return row ?? { up_count: 0, down_count: 0, up_reactors: [], down_reactors: [], my_reaction: null }
}

/**
 * La cible d'un commentaire existe-t-elle dans le groupe actif ? C'est la
 * vérification de droit de toutes les routes de commentaires : on ne lit et on
 * n'écrit que dans une discussion dont la cible appartient au groupe.
 * Retourne de quoi nommer la notification (sujet et lien), ou `null`.
 */
export async function findCommentThread(
	thread: CommentThread,
	groupId: number
): Promise<{ subject: string; link: string } | null> {
	if (thread.kind === 'recording') {
		const [rec] = await sql<{ song_title: string }[]>`
			SELECT so.title AS song_title
			FROM recordings r
			JOIN sessions ses ON ses.id = r.session_id
			JOIN songs so     ON so.id  = r.song_id
			WHERE r.id = ${thread.id} AND ses.group_id = ${groupId}
		`
		return rec ? { subject: rec.song_title, link: `/recording/${thread.id}` } : null
	}

	const [setlist] = await sql<{ name: string }[]>`
		SELECT name FROM setlists WHERE id = ${thread.id} AND group_id = ${groupId}
	`
	return setlist ? { subject: setlist.name, link: `/setlists/${thread.id}` } : null
}

/** La cible d'un commentaire déjà en base, telle que les routes la relisent. */
export function commentThread(row: {
	recording_id: number | null
	setlist_id: number | null
}): CommentThread {
	return row.recording_id !== null
		? { kind: 'recording', id: row.recording_id }
		: { kind: 'setlist', id: row.setlist_id as number }
}
