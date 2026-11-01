import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import sql from '$lib/server/db'
import { restoreWholeRecording } from '$lib/server/audio-trim'
import { canRestoreTrimmedAudio } from '$lib/types'

/** Défait le recadrage fait à l'envoi : la prise redevient l'enregistrement entier. */
export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	const groupId = locals.user.current_group_id
	if (!groupId) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	const [recording] = await sql<{ uploaded_by_user_id: number | null }[]>`
		SELECT r.uploaded_by_user_id
		FROM recordings r
		JOIN sessions ses ON ses.id = r.session_id
		WHERE r.id = ${id} AND ses.group_id = ${groupId}
	`
	if (!recording) return json({ error: 'Prise introuvable.' }, { status: 404 })
	if (!canRestoreTrimmedAudio(locals.user, groupId, recording.uploaded_by_user_id)) {
		return json({ error: 'Réservé à qui a déposé la prise et aux admins du groupe.' }, { status: 403 })
	}

	try {
		const outcome = await restoreWholeRecording(id)
		if (!outcome.ok) return json({ error: outcome.error }, { status: outcome.status })
		return json({ success: true })
	} catch (err) {
		console.error('[trim]', err)
		return json({ error: "Le fichier entier n'a pas pu être rétabli." }, { status: 500 })
	}
}
