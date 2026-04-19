import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import sql from '$lib/server/db'

/** POST — ajoute une prise à la playlist (position = MAX + 1) */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })

	const playlistId = parseInt(params.id)
	if (isNaN(playlistId)) return json({ error: 'ID invalide.' }, { status: 400 })

	const body = await request.json()
	const recordingId: unknown = body.recording_id
	const note: unknown = body.note

	if (typeof recordingId !== 'number' || !Number.isInteger(recordingId)) {
		return json({ error: 'recording_id invalide.' }, { status: 400 })
	}

	const item = await sql.begin(async (tx) => {
		const [playlist] = await tx`SELECT id FROM playlists WHERE id = ${playlistId}`
		if (!playlist) throw Object.assign(new Error(), { code: 'playlist_not_found' })

		const [rec] = await tx`SELECT id FROM recordings WHERE id = ${recordingId}`
		if (!rec) throw Object.assign(new Error(), { code: 'recording_not_found' })

		const [{ next_pos }] = await tx`
			SELECT COALESCE(MAX(position), 0) + 1 AS next_pos
			FROM playlist_items WHERE playlist_id = ${playlistId}
		`
		const [newItem] = await tx`
			INSERT INTO playlist_items (playlist_id, recording_id, position, note)
			VALUES (
				${playlistId}, ${recordingId}, ${next_pos},
				${typeof note === 'string' && note.trim() ? note.trim() : null}
			)
			RETURNING *
		`
		await tx`UPDATE playlists SET updated_at = now() WHERE id = ${playlistId}`
		return newItem
	})

	return json(item, { status: 201 })
}

/** PATCH — met à jour les positions de tous les items dans une transaction */
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })

	const playlistId = parseInt(params.id)
	if (isNaN(playlistId)) return json({ error: 'ID invalide.' }, { status: 400 })

	const body = await request.json()
	if (!Array.isArray(body)) {
		return json({ error: 'Body doit être un tableau [{ id, position }].' }, { status: 400 })
	}

	const updates = body as unknown[]
	for (const u of updates) {
		if (
			typeof u !== 'object' || u === null ||
			typeof (u as Record<string, unknown>).id !== 'number' ||
			typeof (u as Record<string, unknown>).position !== 'number'
		) {
			return json({ error: 'Chaque élément doit avoir id (number) et position (number).' }, { status: 400 })
		}
	}

	await sql.begin(async (tx) => {
		// La contrainte UNIQUE (playlist_id, position) interdirait les états intermédiaires
		// si on met à jour position par position. On négatise d'abord toutes les positions
		// pour garantir l'absence de conflit pendant la réécriture.
		await tx`
			UPDATE playlist_items SET position = -position WHERE playlist_id = ${playlistId}
		`
		for (const u of updates as { id: number; position: number }[]) {
			await tx`
				UPDATE playlist_items SET position = ${u.position}
				WHERE id = ${u.id} AND playlist_id = ${playlistId}
			`
		}
		await tx`UPDATE playlists SET updated_at = now() WHERE id = ${playlistId}`
	})

	return json({ success: true })
}
