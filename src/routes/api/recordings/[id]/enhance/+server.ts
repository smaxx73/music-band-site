import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import {
	applyEnhancement,
	enhanceState,
	findEnhanceTarget,
	revertEnhancement,
	type EnhanceTarget
} from '$lib/server/audio-enhance'
import { parseEnhanceSettings } from '$lib/audio-enhance'

type Resolved = { ok: true; target: EnhanceTarget } | { ok: false; response: Response }

// Tout membre du groupe actif : comme la note d'une prise, c'est un geste de travail
// sur le son commun, et il se défait.
async function resolve(locals: App.Locals, rawId: string): Promise<Resolved> {
	if (!locals.user) return { ok: false, response: json({ error: 'Non autorisé' }, { status: 401 }) }
	if (!locals.user.current_group_id) {
		return { ok: false, response: json({ error: 'Aucun groupe actif.' }, { status: 403 }) }
	}
	const id = parseInt(rawId)
	if (isNaN(id)) return { ok: false, response: json({ error: 'ID invalide.' }, { status: 400 }) }

	const target = await findEnhanceTarget(id, locals.user.current_group_id)
	if (!target) return { ok: false, response: json({ error: 'Prise introuvable.' }, { status: 404 }) }
	if (!target.file_path) {
		return { ok: false, response: json({ error: 'Cette prise n’a pas de piste audio.' }, { status: 400 }) }
	}
	return { ok: true, target }
}

/** Mesures de l'original, diagnostic, réglages de la chaîne et état de la prise. */
export const GET: RequestHandler = async ({ locals, params }) => {
	const resolved = await resolve(locals, params.id)
	if (!resolved.ok) return resolved.response
	return json(await enhanceState(resolved.target))
}

/** Garde la version améliorée avec les réglages choisis (aperçu refait au besoin). */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const resolved = await resolve(locals, params.id)
	if (!resolved.ok) return resolved.response
	const settings = parseEnhanceSettings(await request.json().catch(() => null))
	if (!settings) return json({ error: 'Réglages invalides.' }, { status: 400 })
	try {
		const outcome = await applyEnhancement(resolved.target, locals.user!.id, settings)
		if (!outcome.ok) return json({ error: outcome.error }, { status: outcome.status })
		const target = await findEnhanceTarget(resolved.target.id, locals.user!.current_group_id!)
		return json(target ? await enhanceState(target) : null)
	} catch (err) {
		console.error('[enhance] application', err)
		return json({ error: 'Erreur lors de l’amélioration du son.' }, { status: 500 })
	}
}

/** Revient à l'original. */
export const DELETE: RequestHandler = async ({ locals, params }) => {
	const resolved = await resolve(locals, params.id)
	if (!resolved.ok) return resolved.response
	try {
		const outcome = await revertEnhancement(resolved.target)
		if (!outcome.ok) return json({ error: outcome.error }, { status: outcome.status })
		return json({ success: true })
	} catch (err) {
		console.error('[enhance] retour à l’original', err)
		return json({ error: 'Impossible de rétablir l’original.' }, { status: 500 })
	}
}
