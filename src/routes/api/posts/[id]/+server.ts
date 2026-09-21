import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import { deletePost, getPost, updatePostMessage } from '$lib/server/posts'

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })
	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	const post = await getPost(id, locals.user.current_group_id)
	if (!post) return json({ error: 'Publication introuvable.' }, { status: 404 })
	return json(post)
}

/** PATCH — `{ message }`, par l'auteur seul. */
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })
	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	const body: unknown = await request.json().catch(() => null)
	if (!body || typeof body !== 'object' || !Object.hasOwn(body, 'message')) {
		return json({ error: 'message est obligatoire.' }, { status: 400 })
	}

	const result = await updatePostMessage(
		locals.user,
		id,
		locals.user.current_group_id,
		(body as { message: unknown }).message
	)
	if (!result.ok) return json({ error: result.error }, { status: result.status })
	return json(result.value)
}

/** DELETE — auteur et admins du groupe. L'enregistrement perso montré reste chez son auteur. */
export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })
	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	const result = await deletePost(locals.user, id, locals.user.current_group_id)
	if (!result.ok) return json({ error: result.error }, { status: result.status })
	return json({ success: true })
}
