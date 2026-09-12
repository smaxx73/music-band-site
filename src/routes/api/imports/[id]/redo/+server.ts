import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import { access } from 'fs/promises'
import { loadAnyImport, releaseImport, sourcePath } from '$lib/server/imports'

/**
 * Reprend une découpe déjà validée, tant que l'original est en rétention.
 *
 * Les prises issues de la découpe précédente ne sont **pas** supprimées : on ne défait
 * rien dans le dos de l'utilisateur, d'autant qu'une partie d'entre elles est en général
 * bonne. À lui d'écarter celles qu'il ne garde pas, depuis la session.
 */
export const POST: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const audioImport = await loadAnyImport(locals.user.id, locals.user.current_group_id, params.id)
	if (!audioImport) return json({ error: 'Import introuvable.' }, { status: 404 })

	// La ligne peut survivre à ses octets (conteneur redémarré) : sans original, il n'y a
	// rien à redécouper, et mieux vaut le dire que d'ouvrir un écran vide.
	try {
		await access(sourcePath(audioImport.id))
	} catch {
		return json({ error: "Le fichier d'origine n'est plus disponible." }, { status: 410 })
	}

	await releaseImport(audioImport.id)
	return json({ id: audioImport.id })
}
