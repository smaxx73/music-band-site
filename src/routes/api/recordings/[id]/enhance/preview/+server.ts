import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import { discardPreview, findEnhanceTarget, preparePreview } from '$lib/server/audio-enhance'
import { parseEnhanceSettings } from '$lib/audio-enhance'

/**
 * Prépare la version améliorée, à écouter avant de la garder, avec les réglages choisis
 * (`{ eq: 'none' | 'soft' | 'full', compression: boolean }`). Quelques secondes pour un
 * morceau : la requête attend le rendu plutôt que d'inventer un suivi de tâche.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	const settings = parseEnhanceSettings(await request.json().catch(() => null))
	if (!settings) return json({ error: 'Réglages invalides.' }, { status: 400 })

	const target = await findEnhanceTarget(id, locals.user.current_group_id)
	if (!target) return json({ error: 'Prise introuvable.' }, { status: 404 })

	try {
		const outcome = await preparePreview(target, settings)
		if (!outcome.ok) return json({ error: outcome.error }, { status: outcome.status })
		return json({ preview: settings }, { status: 201 })
	} catch (err) {
		console.error('[enhance] aperçu', err)
		return json({ error: 'Erreur lors de la préparation de l’aperçu.' }, { status: 500 })
	}
}

/** Écarte l'aperçu sans le garder. */
export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	const target = await findEnhanceTarget(id, locals.user.current_group_id)
	if (!target) return json({ error: 'Prise introuvable.' }, { status: 404 })

	await discardPreview(id)
	return json({ success: true })
}
