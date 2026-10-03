import type { RequestHandler } from './$types'
import { findEnhanceTarget, versionFile } from '$lib/server/audio-enhance'
import { streamAudioFile } from '$lib/server/storage'

/**
 * L'une des deux versions d'une prise, pour les comparer : `?version=original` ou
 * `?version=enhanced`. Mêmes règles que `/audio/` — session et groupe actif vérifiés
 * avant d'ouvrir le fichier. Jamais en cache : une version change de fichier quand on
 * garde l'amélioration ou qu'on revient à l'original.
 */
export const GET: RequestHandler = async ({ locals, params, url, request }) => {
	if (!locals.user) return new Response('Non autorisé', { status: 401 })
	if (!locals.user.current_group_id) return new Response('Aucun groupe actif', { status: 403 })

	const id = parseInt(params.id)
	const version = url.searchParams.get('version')
	if (isNaN(id) || (version !== 'original' && version !== 'enhanced')) {
		return new Response('Not found', { status: 404 })
	}

	const target = await findEnhanceTarget(id, locals.user.current_group_id)
	if (!target?.file_path) return new Response('Not found', { status: 404 })

	const path = await versionFile(target, version)
	const response = path ? await streamAudioFile(path, request) : null
	if (!response) return new Response('Not found', { status: 404 })
	response.headers.set('Cache-Control', 'no-store')
	return response
}
