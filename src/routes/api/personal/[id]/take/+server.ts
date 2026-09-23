import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import { classifyPersonalRecording } from '$lib/server/personal'
import { notifyGroup } from '$lib/server/notifications'

/**
 * Classer un enregistrement perso : il quitte le carnet et devient une prise de la session
 * choisie, dans le groupe actif. C'est la porte de sortie de l'espace perso pour ce qui a
 * été capté avant d'avoir une session où le ranger.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	const body = await request.json()
	const sessionId = Number(body.session_id)
	const songId = Number(body.song_id)
	if (!Number.isInteger(sessionId) || sessionId <= 0) {
		return json({ error: 'session_id manquant ou invalide.' }, { status: 400 })
	}
	if (!Number.isInteger(songId) || songId <= 0) {
		return json({ error: 'song_id manquant ou invalide.' }, { status: 400 })
	}

	const groupId = locals.user.current_group_id
	const result = await classifyPersonalRecording({
		id,
		userId: locals.user.id,
		groupId,
		sessionId,
		songId,
		author: locals.user.display_name
	})

	if (!result.ok) {
		const payload: Record<string, unknown> = { error: result.error }
		if (result.duplicate) payload.duplicate = result.duplicate
		return json(payload, { status: result.status })
	}

	// Une prise de plus pour le groupe : elle s'annonce comme celle d'un upload.
	await notifyGroup({
		groupId,
		actor: { id: locals.user.id, display_name: locals.user.display_name },
		type: 'recording',
		subject: result.song_title,
		excerpt: `Prise ${result.recording.take}`,
		link: `/recording/${result.recording.id}`,
		recordingId: result.recording.id,
		sessionId: result.recording.session_id
	})

	return json(result.recording, { status: 201 })
}
