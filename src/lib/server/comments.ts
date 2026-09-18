import sql from '$lib/server/db'
import type { CommentWithReactions, ReactionValue } from '$lib/types'

export type ReactionSummary = {
	up_count: number
	down_count: number
	up_reactors: string[]
	down_reactors: string[]
	my_reaction: ReactionValue | null
}

/**
 * Commentaires d'une prise, enrichis des compteurs de pouces et de la réaction
 * de l'utilisateur courant. Le contrôle du groupe est à faire par l'appelant.
 */
export function commentsWithReactions(recordingId: number, userId: number) {
	return sql<CommentWithReactions[]>`
		SELECT
			c.id, c.recording_id, COALESCE(MAX(u.display_name), c.author) AS author,
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
		WHERE c.recording_id = ${recordingId}
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
