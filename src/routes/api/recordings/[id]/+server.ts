import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import sql from '$lib/server/db'

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })

	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	const [recording] = await sql`
		SELECT
			r.*,
			s.title      AS song_title,
			s.composer   AS song_composer,
			s.key        AS song_key,
			ses.date     AS session_date,
			ses.location AS session_location,
			ses.id       AS session_id
		FROM recordings r
		JOIN songs   s   ON s.id   = r.song_id
		JOIN sessions ses ON ses.id = r.session_id
		WHERE r.id = ${id}
	`

	if (!recording) return json({ error: 'Prise introuvable.' }, { status: 404 })

	return json(recording)
}

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })

	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	const body = await request.json()
	const validStatuses = ['en_cours', 'au_point', 'repertoire']

	if (body.status !== undefined && !validStatuses.includes(body.status)) {
		return json({ error: 'Statut invalide.' }, { status: 400 })
	}

	const updates: Record<string, unknown> = {}
	if (body.status !== undefined) updates.status = body.status
	if ('notes' in body)
		updates.notes =
			typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null

	if (Object.keys(updates).length === 0) {
		return json({ error: 'Aucun champ à modifier.' }, { status: 400 })
	}

	const [recording] = await sql`UPDATE recordings SET ${sql(updates)} WHERE id = ${id} RETURNING *`
	if (!recording) return json({ error: 'Prise introuvable.' }, { status: 404 })

	return json(recording)
}
