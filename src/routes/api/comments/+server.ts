import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import sql from '$lib/server/db'

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const recordingId = parseInt(url.searchParams.get('recording_id') ?? '')
	if (isNaN(recordingId)) {
		return json({ error: 'Paramètre recording_id manquant ou invalide.' }, { status: 400 })
	}

	const comments = await sql`
		SELECT c.* FROM comments c
		JOIN recordings r ON r.id = c.recording_id
		JOIN sessions ses ON ses.id = r.session_id
		WHERE c.recording_id = ${recordingId}
		  AND ses.group_id = ${locals.user.current_group_id}
		ORDER BY timestamp_s ASC NULLS LAST, created_at ASC
	`

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
		INSERT INTO comments (recording_id, author, content, timestamp_s)
		VALUES (
			${recordingId},
			${locals.user.name},
			${content.trim()},
			${typeof timestampS === 'number' ? timestampS : null}
		)
		RETURNING *
	`

	return json(comment, { status: 201 })
}
