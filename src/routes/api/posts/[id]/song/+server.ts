import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import { addSuggestionToSongs } from '$lib/server/posts'

/**
 * POST — fait entrer une suggestion au référentiel (statut `proposition_de_travail`).
 * `409` avec `song_id` quand le morceau existe déjà : l'écran y renvoie plutôt que d'échouer.
 */
export const POST: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })
	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	try {
		const result = await addSuggestionToSongs(id, locals.user.current_group_id)
		if (!result.ok) {
			return json(
				{ error: result.error, ...('song_id' in result ? { song_id: result.song_id } : {}) },
				{ status: result.status }
			)
		}
		return json(result.value, { status: 201 })
	} catch (err) {
		// Course perdue contre un ajout depuis /songs, à la casse près.
		if ((err as { code?: string }).code === '23505') {
			return json({ error: 'Un morceau de ce titre existe déjà.' }, { status: 409 })
		}
		throw err
	}
}
