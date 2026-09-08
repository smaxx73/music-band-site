import sql from '$lib/server/db'
import type { CommentWithReactions, ReactionValue } from '$lib/types'

export type ReactionSummary = {
	up_count: number
	down_count: number
	my_reaction: ReactionValue | null
}

/**
 * Commentaires d'une prise, enrichis des compteurs de pouces et de la réaction
 * de l'utilisateur courant. Le contrôle du groupe est à faire par l'appelant.
 */
export function commentsWithReactions(recordingId: number, userId: number) {
	return sql<CommentWithReactions[]>`
		SELECT
			c.*,
			COUNT(cr.user_id) FILTER (WHERE cr.value = 1)::int       AS up_count,
			COUNT(cr.user_id) FILTER (WHERE cr.value = -1)::int      AS down_count,
			MAX(cr.value) FILTER (WHERE cr.user_id = ${userId})::int AS my_reaction
		FROM comments c
		LEFT JOIN comment_reactions cr ON cr.comment_id = c.id
		WHERE c.recording_id = ${recordingId}
		GROUP BY c.id
		ORDER BY c.timestamp_s ASC NULLS LAST, c.created_at ASC
	`
}

/** Compteurs d'un seul commentaire, après écriture d'une réaction. */
export async function reactionSummary(commentId: number, userId: number): Promise<ReactionSummary> {
	const [row] = await sql<ReactionSummary[]>`
		SELECT
			COUNT(user_id) FILTER (WHERE value = 1)::int          AS up_count,
			COUNT(user_id) FILTER (WHERE value = -1)::int         AS down_count,
			MAX(value) FILTER (WHERE user_id = ${userId})::int    AS my_reaction
		FROM comment_reactions
		WHERE comment_id = ${commentId}
	`
	return row ?? { up_count: 0, down_count: 0, my_reaction: null }
}
