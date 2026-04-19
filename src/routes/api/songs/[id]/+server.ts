import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import sql from '$lib/server/db'

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })

	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	const [song] = await sql`
		SELECT s.*, COUNT(r.id)::int AS take_count
		FROM songs s
		LEFT JOIN recordings r ON r.song_id = s.id
		WHERE s.id = ${id}
		GROUP BY s.id
	`

	if (!song) return json({ error: 'Morceau introuvable.' }, { status: 404 })

	return json(song)
}

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })

	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	const body = await request.json()

	const validStatuses = ['en_apprentissage', 'au_repertoire', 'abandonne']
	if (body.status !== undefined && !validStatuses.includes(body.status)) {
		return json({ error: 'Statut invalide.' }, { status: 400 })
	}
	if (body.title !== undefined && (typeof body.title !== 'string' || !body.title.trim())) {
		return json({ error: 'Le titre ne peut pas être vide.' }, { status: 400 })
	}

	const updates: Record<string, string | null> = {}
	if (body.title !== undefined) updates.title = (body.title as string).trim()
	if ('composer' in body)
		updates.composer =
			typeof body.composer === 'string' && body.composer.trim() ? body.composer.trim() : null
	if ('key' in body)
		updates.key = typeof body.key === 'string' && body.key.trim() ? body.key.trim() : null
	if (body.status !== undefined) updates.status = body.status as string

	if (Object.keys(updates).length === 0) {
		return json({ error: 'Aucun champ à modifier.' }, { status: 400 })
	}

	try {
		const [song] = await sql`
			UPDATE songs SET ${sql(updates)} WHERE id = ${id} RETURNING *
		`
		if (!song) return json({ error: 'Morceau introuvable.' }, { status: 404 })
		return json(song)
	} catch (err) {
		if (isUniqueViolation(err)) {
			return json({ error: 'Ce titre existe déjà.' }, { status: 409 })
		}
		throw err
	}
}

export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })

	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	const [{ count }] = await sql`
		SELECT COUNT(*)::int AS count FROM recordings WHERE song_id = ${id}
	`
	if (count > 0) {
		return json(
			{ error: 'Impossible de supprimer : des prises existent pour ce morceau.' },
			{ status: 409 }
		)
	}

	const [deleted] = await sql`DELETE FROM songs WHERE id = ${id} RETURNING id`
	if (!deleted) return json({ error: 'Morceau introuvable.' }, { status: 404 })

	return json({ success: true })
}

function isUniqueViolation(err: unknown): boolean {
	return (
		typeof err === 'object' &&
		err !== null &&
		'code' in err &&
		(err as { code: string }).code === '23505'
	)
}
