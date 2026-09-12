import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import {
	analyzeImport,
	discardImport,
	importPeaks,
	loadImport,
	normalizeParams
} from '$lib/server/imports'

/**
 * Relance la détection des silences avec d'autres réglages. Le fichier reste où il
 * est : réaffiner un découpage ne demande jamais de renvoyer l'audio.
 */
export const GET: RequestHandler = async ({ locals, params, url }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const audioImport = await loadImport(locals.user.id, locals.user.current_group_id, params.id)
	if (!audioImport) return json({ error: 'Import introuvable.' }, { status: 404 })

	const splitParams = normalizeParams({
		threshold_db: url.searchParams.get('threshold_db'),
		min_silence_s: url.searchParams.get('min_silence_s'),
		min_segment_s: url.searchParams.get('min_segment_s')
	})

	try {
		const [analysis, peaks] = await Promise.all([
			analyzeImport(audioImport.id, splitParams),
			importPeaks(audioImport.id)
		])
		return json({ import: audioImport, peaks, ...analysis })
	} catch (err) {
		console.error('[imports] analyse', err)
		return json({ error: "Analyse du fichier impossible." }, { status: 500 })
	}
}

/** Abandon : la ligne et les octets partent ensemble. */
export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const audioImport = await loadImport(locals.user.id, locals.user.current_group_id, params.id)
	if (!audioImport) return json({ error: 'Import introuvable.' }, { status: 404 })

	await discardImport(audioImport.id)
	return json({ success: true })
}
