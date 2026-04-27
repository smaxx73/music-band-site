import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import sql from '$lib/server/db'

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	const [event] = await sql`
		SELECT * FROM calendar_events WHERE id = ${id} AND group_id = ${locals.user.current_group_id}
	`
	if (!event) return json({ error: 'Événement introuvable.' }, { status: 404 })

	if (event.type === 'indisponibilite' && event.author !== locals.user.name) {
		return json({ error: 'Vous ne pouvez modifier que votre propre indisponibilité.' }, { status: 403 })
	}

	const body = await request.json()
	const title = typeof body.title === 'string' ? (body.title.trim() || null) : event.title
	const notes = typeof body.notes === 'string' ? (body.notes.trim() || null) : event.notes

	let sessionId = event.session_id
	if (event.type !== 'indisponibilite' && 'session_id' in body) {
		sessionId = typeof body.session_id === 'number' ? body.session_id : null
		if (sessionId !== null) {
			const [session] = await sql`
				SELECT id FROM sessions WHERE id = ${sessionId} AND group_id = ${locals.user.current_group_id}
			`
			if (!session) return json({ error: 'Session introuvable.' }, { status: 400 })
		}
	}

	const [updated] = await sql`
		UPDATE calendar_events SET title = ${title}, notes = ${notes}, session_id = ${sessionId}
		WHERE id = ${id}
		RETURNING *
	`
	return json(updated)
}

export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	const [event] = await sql`
		SELECT * FROM calendar_events WHERE id = ${id} AND group_id = ${locals.user.current_group_id}
	`
	if (!event) return json({ error: 'Événement introuvable.' }, { status: 404 })

	if (event.type === 'indisponibilite' && event.author !== locals.user.name) {
		return json({ error: 'Vous ne pouvez supprimer que votre propre indisponibilité.' }, { status: 403 })
	}

	await sql`DELETE FROM calendar_events WHERE id = ${id}`
	return json({ success: true })
}
