import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import { canSharePublicly } from '$lib/types'
import { deleteShareLink, findShareLink, findShareTarget } from '$lib/server/share-links'

/**
 * DELETE — révoque un lien. Même droit que pour le créer : qui peut ouvrir une prise au
 * dehors peut aussi la refermer, quel que soit l'auteur du lien.
 */
export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	const link = await findShareLink(id)
	const found = link ? await findShareTarget(link.target, locals.user) : null
	if (!link || !found) return json({ error: 'Lien introuvable.' }, { status: 404 })
	if (!canSharePublicly(locals.user, found.owner)) return json({ error: 'Accès refusé.' }, { status: 403 })

	await deleteShareLink(id)
	return json({ success: true })
}
