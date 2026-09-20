import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import sql from '$lib/server/db'

/** DELETE — retire un morceau du programme et réindexe les positions restantes */
export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const setlistId = parseInt(params.id)
	const itemId = parseInt(params.itemId)
	if (isNaN(setlistId) || isNaN(itemId)) {
		return json({ error: 'ID invalide.' }, { status: 400 })
	}

	const [setlist] = await sql`
		SELECT id FROM setlists
		WHERE id = ${setlistId} AND group_id = ${locals.user.current_group_id}
	`
	if (!setlist) return json({ error: 'Setlist introuvable.' }, { status: 404 })

	const deleted = await sql.begin(async (tx) => {
		const [row] = await tx`
			DELETE FROM setlist_items WHERE id = ${itemId} AND setlist_id = ${setlistId} RETURNING id
		`
		if (!row) return null

		// Réindexer : le programme se lit 1, 2, 3… sans trou. Les positions passent
		// d'abord en négatif, sans quoi UNIQUE (setlist_id, position) refuserait les
		// états intermédiaires — l'ordre des lignes d'un UPDATE n'est pas garanti.
		// Sur des positions négatives, DESC redonne l'ordre d'origine.
		await tx`UPDATE setlist_items SET position = -position WHERE setlist_id = ${setlistId}`
		await tx`
			UPDATE setlist_items si
			SET position = ranked.new_pos
			FROM (
				SELECT id, ROW_NUMBER() OVER (ORDER BY position DESC) AS new_pos
				FROM setlist_items
				WHERE setlist_id = ${setlistId}
			) ranked
			WHERE si.id = ranked.id
		`
		await tx`UPDATE setlists SET updated_at = now() WHERE id = ${setlistId}`
		return row
	})

	if (!deleted) return json({ error: 'Morceau introuvable dans cette setlist.' }, { status: 404 })

	return json({ success: true })
}
