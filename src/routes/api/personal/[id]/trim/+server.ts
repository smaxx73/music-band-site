import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import { restoreWholePersonal } from '$lib/server/personal'

/** Défait le recadrage fait à l'envoi ; le filtre sur le propriétaire est la vérification de droit. */
export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })

	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	try {
		const outcome = await restoreWholePersonal(id, locals.user.id)
		if (!outcome.ok) return json({ error: outcome.error }, { status: outcome.status })
		return json({ success: true })
	} catch (err) {
		console.error('[trim]', err)
		return json({ error: "Le fichier entier n'a pas pu être rétabli." }, { status: 500 })
	}
}
