import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import { loadFeed, parseFeedCursor } from '$lib/server/feed'

/** GET — page suivante du fil du groupe actif : `?before=<curseur>`, tel que rendu par la page précédente. */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	const groupId = locals.user.current_group_id
	if (!groupId) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	// Le fil est lié au groupe pour lequel il a été rendu : un autre onglet a pu changer
	// de groupe (cookie commun), et la suite viendrait alors d'un autre fil.
	const expected = url.searchParams.get('group_id')
	if (expected !== null && Number(expected) !== groupId) {
		return json({ error: 'Le groupe actif a changé.' }, { status: 409 })
	}

	const before = parseFeedCursor(url.searchParams.get('before'))
	if (before === 'invalid') return json({ error: 'Curseur invalide.' }, { status: 400 })

	return json(await loadFeed(groupId, locals.user.id, before))
}
