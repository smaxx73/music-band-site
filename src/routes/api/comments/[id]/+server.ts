import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import sql from '$lib/server/db'
import { commentThread, findCommentThread, reactionSummary } from '$lib/server/comments'
import { canEditComment } from '$lib/types'
import { notifyMentions } from '$lib/server/notifications'

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const commentId = parseInt(params.id)
	if (isNaN(commentId)) return json({ error: 'ID invalide.' }, { status: 400 })

	const payload: unknown = await request.json().catch(() => ({}))
	const body = payload && typeof payload === 'object' && !Array.isArray(payload)
		? payload as Record<string, unknown>
		: {}
	const hasContent = Object.hasOwn(body, 'content')
	const hasTimestamp = Object.hasOwn(body, 'timestamp_s')
	const content: unknown = body.content
	const timestampS: unknown = body.timestamp_s

	if (hasContent && (typeof content !== 'string' || !content.trim())) {
		return json({ error: 'content ne peut pas être vide.' }, { status: 400 })
	}
	if (
		hasTimestamp &&
		timestampS !== null &&
		(typeof timestampS !== 'number' || !Number.isFinite(timestampS) || timestampS < 0)
	) {
		return json({ error: 'timestamp_s invalide.' }, { status: 400 })
	}
	if (!hasContent && !hasTimestamp) {
		return json({ error: 'Aucune modification à enregistrer.' }, { status: 400 })
	}

	// La cible est relue d'abord, puis vérifiée dans le groupe actif : c'est elle qui
	// dit à quel groupe le commentaire appartient, prise ou setlist.
	const [existing] = await sql<{
		id: number
		author_user_id: number | null
		recording_id: number | null
		setlist_id: number | null
		content: string
	}[]>`
		SELECT id, author_user_id, recording_id, setlist_id, content
		FROM comments WHERE id = ${commentId}
	`
	if (!existing) return json({ error: 'Commentaire introuvable.' }, { status: 404 })

	const thread = commentThread(existing)
	const target = await findCommentThread(thread, locals.user.current_group_id)
	if (!target) return json({ error: 'Commentaire introuvable.' }, { status: 404 })

	if (!canEditComment(locals.user, existing.author_user_id)) {
		return json({ error: "Seul l'auteur peut modifier ce commentaire." }, { status: 403 })
	}
	// Une setlist n'a pas de lecture : son commentaire ne s'ancre nulle part.
	if (thread.kind === 'setlist' && typeof timestampS === 'number') {
		return json({ error: "Un commentaire de setlist n'a pas de repère." }, { status: 400 })
	}

	const nextContent = hasContent ? (content as string).trim() : existing.content
	const nextTimestamp: number | null = typeof timestampS === 'number' ? timestampS : null
	const [comment] = hasTimestamp
		? await sql`
			UPDATE comments
			SET content = ${nextContent}, timestamp_s = ${nextTimestamp}, edited_at = now()
			WHERE id = ${commentId}
			RETURNING id, recording_id, setlist_id, author_user_id, content, timestamp_s, created_at, edited_at
		`
		: await sql`
			UPDATE comments
			SET content = ${nextContent}, edited_at = now()
			WHERE id = ${commentId}
			RETURNING id, recording_id, setlist_id, author_user_id, content, timestamp_s, created_at, edited_at
		`

	// La modification n'annonce pas un nouveau contenu au groupe. Seule exception : un
	// membre qu'on vient d'ajouter en mention, qui sinon n'en saurait jamais rien.
	if (nextContent !== existing.content) {
		await notifyMentions(
			{
				groupId: locals.user.current_group_id,
				actor: locals.user,
				subject: target.subject,
				excerpt: nextContent,
				link: target.link,
				recordingId: existing.recording_id,
				setlistId: existing.setlist_id
			},
			nextContent,
			existing.content
		)
	}

	return json({
		...comment,
		author: locals.user.display_name,
		...(await reactionSummary(commentId, locals.user.id))
	})
}
