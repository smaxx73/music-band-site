import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import sql from '$lib/server/db'
import {
	deletePersonalRecording,
	getPersonalRecording,
	normalizeNotes,
	PERSONAL_TITLE_MAX
} from '$lib/server/personal'

// Le filtre sur le propriétaire est la vérification de droit : l'enregistrement d'un
// autre répond 404, admins compris.

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	const recording = await getPersonalRecording(id, locals.user.id)
	if (!recording) return json({ error: 'Enregistrement introuvable.' }, { status: 404 })
	return json(recording)
}

/** PATCH — `{ title?, notes? }`. */
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	const payload: unknown = await request.json().catch(() => null)
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
		return json({ error: 'Corps de requête invalide.' }, { status: 400 })
	}
	const body = payload as Record<string, unknown>
	const hasTitle = Object.hasOwn(body, 'title')
	const hasNotes = Object.hasOwn(body, 'notes')
	if (!hasTitle && !hasNotes) return json({ error: 'Aucune modification à enregistrer.' }, { status: 400 })

	const title = typeof body.title === 'string' ? body.title.trim().slice(0, PERSONAL_TITLE_MAX) : ''
	if (hasTitle && !title) return json({ error: 'Le titre ne peut pas être vide.' }, { status: 400 })
	if (hasNotes && body.notes !== null && typeof body.notes !== 'string') {
		return json({ error: 'notes invalide.' }, { status: 400 })
	}

	const [updated] = await sql`
		UPDATE personal_recordings SET
			title = ${hasTitle ? title : sql`title`},
			notes = ${hasNotes ? normalizeNotes(body.notes) : sql`notes`},
			updated_at = now()
		WHERE id = ${id} AND user_id = ${locals.user.id}
		RETURNING id
	`
	if (!updated) return json({ error: 'Enregistrement introuvable.' }, { status: 404 })
	return json(await getPersonalRecording(id, locals.user.id))
}

/** DELETE — emporte fichier, publications et leurs commentaires. */
export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	if (!(await deletePersonalRecording(id, locals.user.id))) {
		return json({ error: 'Enregistrement introuvable.' }, { status: 404 })
	}
	return json({ success: true })
}
