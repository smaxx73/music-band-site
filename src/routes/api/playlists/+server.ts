import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import sql from '$lib/server/db'

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const groupId = locals.user.current_group_id

	const playlists = await sql`
		SELECT p.*, COUNT(pi.id)::int AS item_count
		FROM playlists p
		LEFT JOIN playlist_items pi ON pi.playlist_id = p.id
		WHERE p.group_id = ${groupId}
		GROUP BY p.id
		ORDER BY p.updated_at DESC NULLS LAST, p.created_at DESC
	`
	return json(playlists)
}

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const body = await request.json()
	const name: unknown = body.name
	const description: unknown = body.description

	if (typeof name !== 'string' || !name.trim()) {
		return json({ error: 'Le nom est obligatoire.' }, { status: 400 })
	}

	const [playlist] = await sql`
		INSERT INTO playlists (group_id, name, description, created_by, updated_at)
		VALUES (
			${locals.user.current_group_id},
			${name.trim()},
			${typeof description === 'string' && description.trim() ? description.trim() : null},
			${locals.user.name},
			now()
		)
		RETURNING *
	`
	return json(playlist, { status: 201 })
}
