import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import sql from '$lib/server/db'
import { reactionSummary } from '$lib/server/comments'
import { canEditComment } from '$lib/types'
import { notifyMentions } from '$lib/server/notifications'

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const commentId = parseInt(params.id)
	if (isNaN(commentId)) return json({ error: 'ID invalide.' }, { status: 400 })

	const body = await request.json().catch(() => ({}))
	const content: unknown = body.content
	if (typeof content !== 'string' || !content.trim()) {
		return json({ error: 'content est obligatoire.' }, { status: 400 })
	}

	const [existing] = await sql<{
		id: number; author_user_id: number | null; recording_id: number; content: string; song_title: string
	}[]>`
		SELECT c.id, c.author_user_id, c.recording_id, c.content, so.title AS song_title
		FROM comments c
		JOIN recordings r ON r.id = c.recording_id
		JOIN sessions ses ON ses.id = r.session_id
		JOIN songs so     ON so.id = r.song_id
		WHERE c.id = ${commentId} AND ses.group_id = ${locals.user.current_group_id}
	`
	if (!existing) return json({ error: 'Commentaire introuvable.' }, { status: 404 })
	if (!canEditComment(locals.user, existing.author_user_id)) {
		return json({ error: "Seul l'auteur peut modifier ce commentaire." }, { status: 403 })
	}

	const [comment] = await sql`
		UPDATE comments
		SET content = ${content.trim()}, edited_at = now()
		WHERE id = ${commentId}
		RETURNING id, recording_id, author_user_id, content, timestamp_s, created_at, edited_at
	`

	// La modification n'annonce pas un nouveau contenu au groupe. Seule exception : un
	// membre qu'on vient d'ajouter en mention, qui sinon n'en saurait jamais rien.
	await notifyMentions(
		{
			groupId: locals.user.current_group_id,
			actor: locals.user,
			subject: existing.song_title,
			excerpt: content.trim(),
			link: `/recording/${existing.recording_id}`,
			recordingId: existing.recording_id
		},
		content,
		existing.content
	)

	return json({
		...comment,
		author: locals.user.display_name,
		...(await reactionSummary(commentId, locals.user.id))
	})
}
