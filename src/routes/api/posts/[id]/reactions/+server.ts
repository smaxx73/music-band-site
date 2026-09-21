import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import { reactToPost } from '$lib/server/posts'

/** POST — `{ value: 1 | -1 }` : pose ou remplace le pouce de l'utilisateur. */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })
	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	const body = await request.json().catch(() => null)
	const value: unknown = body?.value
	if (value !== 1 && value !== -1) return json({ error: 'value doit valoir 1 ou -1.' }, { status: 400 })

	const result = await reactToPost(locals.user.id, id, locals.user.current_group_id, value)
	if (!result.ok) return json({ error: result.error }, { status: result.status })
	return json({ post_id: id, ...result.value })
}

/** DELETE — retire le pouce de l'utilisateur. */
export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })
	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	const result = await reactToPost(locals.user.id, id, locals.user.current_group_id, null)
	if (!result.ok) return json({ error: result.error }, { status: result.status })
	return json({ success: true, post_id: id, ...result.value })
}
