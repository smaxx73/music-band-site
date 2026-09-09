import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import sql from '$lib/server/db'
import { commentsWithReactions } from '$lib/server/comments'

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const recordingId = parseInt(url.searchParams.get('recording_id') ?? '')
	if (isNaN(recordingId)) {
		return json({ error: 'Paramètre recording_id manquant ou invalide.' }, { status: 400 })
	}

	// Le scope groupe est vérifié sur la prise avant de lire les commentaires.
	const [rec] = await sql`
		SELECT r.id FROM recordings r
		JOIN sessions ses ON ses.id = r.session_id
		WHERE r.id = ${recordingId} AND ses.group_id = ${locals.user.current_group_id}
	`
	if (!rec) return json({ error: 'Prise introuvable.' }, { status: 404 })

	const comments = await commentsWithReactions(recordingId, locals.user.id)

	return json(comments)
}

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const body = await request.json()
	const recordingId: unknown = body.recording_id
	const content: unknown = body.content
	const timestampS: unknown = body.timestamp_s

	if (typeof recordingId !== 'number' || !Number.isInteger(recordingId)) {
		return json({ error: 'recording_id invalide.' }, { status: 400 })
	}
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
	const [rec] = await sql`
		SELECT r.id FROM recordings r
		JOIN sessions ses ON ses.id = r.session_id
		WHERE r.id = ${recordingId} AND ses.group_id = ${locals.user.current_group_id}
	`
	if (!rec) return json({ error: 'Prise introuvable.' }, { status: 404 })

	const [comment] = await sql`
		INSERT INTO comments (recording_id, author, author_user_id, content, timestamp_s)
		VALUES (
			${recordingId},
			${locals.user.display_name},
			${locals.user.id},
			${content.trim()},
			${typeof timestampS === 'number' ? timestampS : null}
		)
		RETURNING *
	`

	// Un commentaire tout juste créé n'a encore aucune réaction.
	return json({ ...comment, up_count: 0, down_count: 0, my_reaction: null }, { status: 201 })
}
