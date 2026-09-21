import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import { createPost } from '$lib/server/posts'

/**
 * POST — publie dans le groupe actif, jamais ailleurs :
 * `{ type: 'recording', personal_recording_id, message? }`,
 * `{ type: 'youtube', video_url, message? }` ou
 * `{ type: 'song_suggestion', song_title, song_artist?, video_url?, message? }`.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const body: unknown = await request.json().catch(() => null)
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		return json({ error: 'Corps de requête invalide.' }, { status: 400 })
	}

	const result = await createPost(locals.user, locals.user.current_group_id, body as Record<string, unknown>)
	if (!result.ok) return json({ error: result.error }, { status: result.status })
	return json(result.value, { status: 201 })
}
