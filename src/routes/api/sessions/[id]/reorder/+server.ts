import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import sql from '$lib/server/db'

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const sessionId = parseInt(params.id)
	if (isNaN(sessionId)) return json({ error: 'ID invalide.' }, { status: 400 })

	const body = await request.json()
	if (!Array.isArray(body.groups)) {
		return json({ error: 'groups invalide.' }, { status: 400 })
	}

	type Group = { song_id: unknown; recording_ids: unknown }
	for (const g of body.groups as Group[]) {
		if (typeof g.song_id !== 'number' || !Array.isArray(g.recording_ids)) {
			return json({ error: 'Format de groupe invalide.' }, { status: 400 })
		}
		if (g.recording_ids.some((id) => typeof id !== 'number')) {
			return json({ error: 'recording_ids doit contenir des entiers.' }, { status: 400 })
		}
	}

	await sql.begin(async (tx) => {
		// Vérifier que la session appartient au groupe actif
		const [session] = await tx`
			SELECT id FROM sessions WHERE id = ${sessionId} AND group_id = ${locals.user!.current_group_id}
		`
		if (!session) throw Object.assign(new Error('session_not_found'), { code: 'session_not_found' })

		for (const g of body.groups as { song_id: number; recording_ids: number[] }[]) {
			// Décaler les takes avec un grand offset pour éviter les conflits de contrainte unique
			await tx`
				UPDATE recordings SET take = take + 10000
				WHERE session_id = ${sessionId} AND song_id = ${g.song_id}
			`
			// Réassigner les takes dans le nouvel ordre
			for (let i = 0; i < g.recording_ids.length; i++) {
				await tx`
					UPDATE recordings SET take = ${i + 1}
					WHERE id = ${g.recording_ids[i]}
					  AND session_id = ${sessionId}
					  AND song_id = ${g.song_id}
				`
			}
		}
	})

	return json({ success: true })
}
