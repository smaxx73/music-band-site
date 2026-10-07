import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import sql from '$lib/server/db'
import { isAdmin } from '$lib/types'
import { accessibleDocument, canDeleteScoreDocument, parseScorePayload, validId } from '$lib/server/score-documents'

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	const id = validId(params.id)
	if (!id) return json({ error: 'ID invalide' }, { status: 400 })
	const access = await accessibleDocument(id, locals.user.id, locals.user.current_group_id, isAdmin(locals.user.role))
	if (!access) return json({ error: 'Document introuvable' }, { status: 404 })
	// Le nom est relu dans `users` : un changement de nom affiché s'y répercute.
	const [document] = await sql`
		SELECT d.id, d.song_id, d.title, d.manifest, d.contents, d.updated_at, u.display_name AS updated_by
		FROM score_documents d LEFT JOIN users u ON u.id = d.updated_by_user_id
		WHERE d.id = ${id}
	`
	if (!document) return json({ error: 'Document introuvable' }, { status: 404 })
	const originals = await sql`SELECT block_id, file_name, format, warning FROM score_originals WHERE document_id = ${id}`
	return json({ document: { ...document, can_delete: canDeleteScoreDocument(locals.user, access) }, originals })
}

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	const id = validId(params.id)
	if (!id) return json({ error: 'ID invalide' }, { status: 400 })
	const existing = await accessibleDocument(id, locals.user.id, locals.user.current_group_id, isAdmin(locals.user.role))
	if (!existing) return json({ error: 'Document introuvable' }, { status: 404 })
	let body: unknown
	try { body = await request.json() } catch { return json({ error: 'JSON invalide' }, { status: 400 }) }
	const payload = parseScorePayload(body)
	if (!payload) return json({ error: 'Document invalide' }, { status: 400 })
	if (payload.song_id !== existing.song_id) return json({ error: 'Le morceau du document ne peut pas changer' }, { status: 400 })
	const editorId = locals.user.id
	const result = await sql.begin(async (tx) => {
		const [document] = await tx`
			UPDATE score_documents SET title = ${payload.title}, manifest = ${tx.json(payload.manifest)},
			contents = ${tx.json(payload.contents)}, updated_at = now(), updated_by_user_id = ${editorId}
			WHERE id = ${id}
			RETURNING id, title, updated_at
		`
		if (!document) return null
		const ids = payload.manifest.filter((block) => block.type === 'notation').map((block) => block.id)
		await tx`DELETE FROM score_originals WHERE document_id = ${id} AND NOT (block_id = ANY(${ids}::int[]))`
		return document
	})
	if (!result) return json({ error: 'Document introuvable' }, { status: 404 })
	return json({ document: { ...result, updated_by: locals.user.display_name } })
}

export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	const id = validId(params.id)
	if (!id) return json({ error: 'ID invalide' }, { status: 400 })
	const access = await accessibleDocument(id, locals.user.id, locals.user.current_group_id, isAdmin(locals.user.role))
	if (!access) return json({ error: 'Document introuvable' }, { status: 404 })
	if (!canDeleteScoreDocument(locals.user, access)) {
		return json({ error: "Seul l'auteur de la feuille ou un administrateur du groupe peut la supprimer." }, { status: 403 })
	}
	await sql`DELETE FROM score_documents WHERE id = ${id}`
	return json({ success: true })
}
