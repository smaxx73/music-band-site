import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import sql from '$lib/server/db'
import { reactionSummary } from '$lib/server/comments'

/** Vérifie que le commentaire existe et appartient bien au groupe actif. */
async function findComment(commentId: number, groupId: number) {
	const [row] = await sql<{ id: number }[]>`
		SELECT c.id FROM comments c
		JOIN recordings r ON r.id = c.recording_id
		JOIN sessions ses ON ses.id = r.session_id
		WHERE c.id = ${commentId} AND ses.group_id = ${groupId}
	`
	return row ?? null
}

export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const commentId = parseInt(params.id)
	if (isNaN(commentId)) return json({ error: 'ID invalide.' }, { status: 400 })

	const body = await request.json()
	const value: unknown = body.value
	if (value !== 1 && value !== -1) {
		return json({ error: 'value doit valoir 1 ou -1.' }, { status: 400 })
	}

	const comment = await findComment(commentId, locals.user.current_group_id)
	if (!comment) return json({ error: 'Commentaire introuvable.' }, { status: 404 })

	const userId = locals.user.id

	// Une réaction par utilisateur : re-cliquer le même pouce la retire.
	await sql`
		INSERT INTO comment_reactions (comment_id, user_id, value)
		VALUES (${commentId}, ${userId}, ${value})
		ON CONFLICT (comment_id, user_id) DO UPDATE SET value = EXCLUDED.value
	`

	return json({ comment_id: commentId, ...(await reactionSummary(commentId, userId)) })
}

export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const commentId = parseInt(params.id)
	if (isNaN(commentId)) return json({ error: 'ID invalide.' }, { status: 400 })

	const comment = await findComment(commentId, locals.user.current_group_id)
	if (!comment) return json({ error: 'Commentaire introuvable.' }, { status: 404 })

	const userId = locals.user.id
	await sql`DELETE FROM comment_reactions WHERE comment_id = ${commentId} AND user_id = ${userId}`

	return json({ success: true, comment_id: commentId, ...(await reactionSummary(commentId, userId)) })
}
