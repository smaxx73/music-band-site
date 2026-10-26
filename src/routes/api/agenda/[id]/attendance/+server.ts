import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import { setAttendance } from '$lib/server/attendance'
import { ATTENDANCE_NOTE_MAX, isAttendanceResponse } from '$lib/attendance'

// POST /api/agenda/[id]/attendance { response, note? } → la réponse du membre connecté.
// Rend les présences de l'événement, pour que l'écran se mette à jour d'un coup.
export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	const groupId = locals.user.current_group_id
	if (!groupId) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	const body = await request.json().catch(() => null)
	if (!isAttendanceResponse(body?.response)) {
		return json({ error: 'Réponse invalide (present, maybe ou absent).' }, { status: 400 })
	}
	let note: string | null | undefined
	if (body.note !== undefined) {
		if (body.note !== null && typeof body.note !== 'string') {
			return json({ error: 'Note invalide.' }, { status: 400 })
		}
		note = body.note?.trim() || null
		if (note && note.length > ATTENDANCE_NOTE_MAX) {
			return json({ error: `La note tient en ${ATTENDANCE_NOTE_MAX} caractères.` }, { status: 400 })
		}
	}

	const result = await setAttendance(id, groupId, locals.user.id, body.response, note)
	if (!result.ok) return json({ error: result.error }, { status: result.status })
	return json({ attendance: result.value })
}
