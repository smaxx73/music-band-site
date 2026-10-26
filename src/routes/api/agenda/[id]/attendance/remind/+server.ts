import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import { remindAttendance } from '$lib/server/attendance'

// POST /api/agenda/[id]/attendance/remind → relance les membres sans réponse (tout membre),
// ou pose la question si elle ne l'avait pas encore été. Rend { reminded, attendance }.
export const POST: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	const groupId = locals.user.current_group_id
	if (!groupId) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	const result = await remindAttendance(id, groupId, locals.user)
	if (!result.ok) return json({ error: result.error }, { status: result.status })
	return json(result.value)
}
