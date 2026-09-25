import type { RequestHandler } from './$types'
import { join } from 'path'
import { audioDir } from '$lib/server/config'
import { streamAudioFile } from '$lib/server/storage'
import { attachmentHeader, downloadFileName, resolveShareToken } from '$lib/server/share-links'

/**
 * Fichier d'un lien d'écoute, sans compte. Toujours par Node, comme `/audio/` : le jeton
 * est revérifié à chaque requête, pour qu'un lien révoqué ou expiré cesse aussitôt de
 * servir le fichier — lecture en cours comprise. `?download` le donne en pièce jointe.
 */
export const GET: RequestHandler = async ({ params, request, url }) => {
	const shared = await resolveShareToken(params.token)
	if (!shared) return new Response('Not found', { status: 404 })

	const response = await streamAudioFile(join(audioDir(), shared.filePath), request)
	if (!response) return new Response('Not found', { status: 404 })

	response.headers.set('X-Robots-Tag', 'noindex, nofollow')
	response.headers.set('Cache-Control', 'private, no-store')
	if (url.searchParams.has('download')) {
		response.headers.set('Content-Disposition', attachmentHeader(downloadFileName(shared)))
	}
	return response
}
