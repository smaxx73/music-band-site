import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import sql from '$lib/server/db'
import { isAdmin } from '$lib/types'
import { parseScorePayload } from '$lib/server/score-documents'

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	const songId = url.searchParams.has('song_id') ? Number(url.searchParams.get('song_id')) : null
	if (songId !== null && (!Number.isSafeInteger(songId) || songId < 1)) return json({ error: 'Morceau invalide' }, { status: 400 })
	if (songId === null && !isAdmin(locals.user.role)) return json({ error: 'Accès refusé' }, { status: 403 })
	if (songId !== null) {
		const [song] = await sql`SELECT id FROM songs WHERE id = ${songId} AND group_id = ${locals.user.current_group_id}`
		if (!song) return json({ error: 'Morceau introuvable' }, { status: 404 })
	}
	const documents = songId === null
		? await sql`SELECT id, title, updated_at FROM score_documents WHERE user_id = ${locals.user.id} AND song_id IS NULL ORDER BY updated_at DESC, id DESC`
		: await sql`SELECT id, title, updated_at FROM score_documents WHERE song_id = ${songId}`
	return json({ documents })
}

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	let body: unknown
	try { body = await request.json() } catch { return json({ error: 'JSON invalide' }, { status: 400 }) }
	const payload = parseScorePayload(body)
	if (!payload) return json({ error: 'Document invalide' }, { status: 400 })
	if (payload.song_id === null && !isAdmin(locals.user.role)) return json({ error: 'Accès refusé' }, { status: 403 })
	if (payload.song_id !== null) {
		const [song] = await sql`SELECT id FROM songs WHERE id = ${payload.song_id} AND group_id = ${locals.user.current_group_id}`
		if (!song) return json({ error: 'Morceau introuvable' }, { status: 404 })
	}
	const [document] = await sql`
		INSERT INTO score_documents (user_id, updated_by_user_id, song_id, title, manifest, contents)
		VALUES (${locals.user.id}, ${locals.user.id}, ${payload.song_id}, ${payload.title}, ${sql.json(payload.manifest)}, ${sql.json(payload.contents)})
		ON CONFLICT (song_id) DO NOTHING
		RETURNING id, title, updated_at
	`
	if (!document) return json({ error: 'Ce morceau possède déjà une partition. Recharge la page.' }, { status: 409 })
	return json({ document: { ...document, updated_by: locals.user.display_name } }, { status: 201 })
}
