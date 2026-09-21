import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import sql from '$lib/server/db'
import { commentsWithReactions, findCommentThread } from '$lib/server/comments'
import { notifyGroup, notifyMentions } from '$lib/server/notifications'
import type { CommentThread } from '$lib/types'

/**
 * Une discussion porte sur une prise, une setlist ou une publication — une seule :
 * `recording_id`, `setlist_id` et `post_id` s'excluent, comme la contrainte
 * `comments_target` l'impose en base. Même lecture pour la requête et le corps JSON.
 * L'ancrage d'une publication n'est pas connu ici : `findCommentThread` le dit.
 */
function readThread(source: {
	recording_id?: unknown
	setlist_id?: unknown
	post_id?: unknown
}): CommentThread | { error: string } {
	const parse = (value: unknown): number | null => {
		if (value === undefined || value === null || value === '') return null
		const id = typeof value === 'number' ? value : Number(value)
		return Number.isInteger(id) && id > 0 ? id : NaN
	}

	const recordingId = parse(source.recording_id)
	const setlistId = parse(source.setlist_id)
	const postId = parse(source.post_id)
	if (Number.isNaN(recordingId)) return { error: 'recording_id invalide.' }
	if (Number.isNaN(setlistId)) return { error: 'setlist_id invalide.' }
	if (Number.isNaN(postId)) return { error: 'post_id invalide.' }
	if ([recordingId, setlistId, postId].filter((id) => id !== null).length > 1) {
		return { error: 'Un commentaire porte sur une seule cible : prise, setlist ou publication.' }
	}
	if (recordingId !== null) return { kind: 'recording', id: recordingId }
	if (setlistId !== null) return { kind: 'setlist', id: setlistId }
	if (postId !== null) return { kind: 'post', id: postId, anchorable: false }
	return { error: 'recording_id, setlist_id ou post_id est obligatoire.' }
}

/** Libellé du 404, selon ce que la requête visait. */
function notFound(thread: CommentThread): string {
	switch (thread.kind) {
		case 'recording': return 'Prise introuvable.'
		case 'setlist': return 'Setlist introuvable.'
		case 'post': return 'Publication introuvable.'
	}
}

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const thread = readThread({
		recording_id: url.searchParams.get('recording_id'),
		setlist_id: url.searchParams.get('setlist_id'),
		post_id: url.searchParams.get('post_id')
	})
	if ('error' in thread) return json({ error: thread.error }, { status: 400 })

	// Le scope groupe est vérifié sur la cible avant de lire les commentaires.
	const target = await findCommentThread(thread, locals.user.current_group_id)
	if (!target) {
		return json({ error: notFound(thread) }, { status: 404 })
	}

	const comments = await commentsWithReactions(thread, locals.user.id)

	return json(comments)
}

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const body = await request.json()
	const content: unknown = body.content
	const timestampS: unknown = body.timestamp_s

	const thread = readThread(body as Record<string, unknown>)
	if ('error' in thread) return json({ error: thread.error }, { status: 400 })

	if (typeof content !== 'string' || !content.trim()) {
		return json({ error: 'content est obligatoire.' }, { status: 400 })
	}
	if (
		timestampS !== undefined &&
		timestampS !== null &&
		(typeof timestampS !== 'number' || timestampS < 0)
	) {
		return json({ error: 'timestamp_s invalide.' }, { status: 400 })
	}
	// L'identité est toujours celle de la session ; elle ne doit pas être fournie par le client.
	const target = await findCommentThread(thread, locals.user.current_group_id)
	if (!target) {
		return json({ error: notFound(thread) }, { status: 404 })
	}
	// Une setlist, une suggestion sans vidéo ne se lisent pas : rien où ancrer un commentaire.
	if (!target.anchorable && typeof timestampS === 'number') {
		return json({ error: "Ce commentaire ne peut pas porter de repère : il n'y a rien à lire." }, { status: 400 })
	}

	const recordingId = thread.kind === 'recording' ? thread.id : null
	const setlistId = thread.kind === 'setlist' ? thread.id : null
	const postId = thread.kind === 'post' ? thread.id : null

	const [comment] = await sql`
		INSERT INTO comments (recording_id, setlist_id, post_id, author, author_user_id, content, timestamp_s)
		VALUES (
			${recordingId},
			${setlistId},
			${postId},
			${locals.user.display_name},
			${locals.user.id},
			${content.trim()},
			${typeof timestampS === 'number' ? timestampS : null}
		)
		RETURNING *
	`

	const notification = {
		groupId: locals.user.current_group_id,
		actor: locals.user,
		subject: target.subject,
		excerpt: content.trim(),
		link: target.link,
		recordingId,
		setlistId,
		postId
	}
	// Un membre mentionné reçoit la mention à la place du « a commenté » générique :
	// deux notifications pour un même commentaire noieraient celle qui lui est adressée.
	const mentioned = await notifyMentions(notification, content)
	await notifyGroup({ ...notification, type: 'comment' }, mentioned)

	// Un commentaire tout juste créé n'a encore aucune réaction.
	return json({
		...comment,
		up_count: 0,
		down_count: 0,
		up_reactors: [],
		down_reactors: [],
		my_reaction: null
	}, { status: 201 })
}
