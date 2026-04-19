import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import sql from '$lib/server/db'

/** DELETE — supprime un item et réindexe les positions restantes */
export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })

	const playlistId = parseInt(params.id)
	const itemId = parseInt(params.itemId)
	if (isNaN(playlistId) || isNaN(itemId)) {
		return json({ error: 'ID invalide.' }, { status: 400 })
	}

	await sql.begin(async (tx) => {
		const [deleted] = await tx`
			DELETE FROM playlist_items WHERE id = ${itemId} AND playlist_id = ${playlistId} RETURNING id
		`
		if (!deleted) throw Object.assign(new Error(), { code: 'not_found' })

		// Réindexer : ROW_NUMBER() dans l'ordre de position actuel
		await tx`
			UPDATE playlist_items pi
			SET position = ranked.new_pos
			FROM (
				SELECT id, ROW_NUMBER() OVER (ORDER BY position) AS new_pos
				FROM playlist_items
				WHERE playlist_id = ${playlistId}
			) ranked
			WHERE pi.id = ranked.id
		`
		await tx`UPDATE playlists SET updated_at = now() WHERE id = ${playlistId}`
	})

	return json({ success: true })
}
