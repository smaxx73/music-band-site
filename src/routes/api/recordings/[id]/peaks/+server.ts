import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import sql from '$lib/server/db'
import { loadPeaks } from '$lib/server/peaks'

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	const [recording] = await sql`
		SELECT r.file_path, r.duration_s
		FROM recordings r
		JOIN sessions ses ON ses.id = r.session_id
		WHERE r.id = ${id} AND ses.group_id = ${locals.user.current_group_id}
	`

	if (!recording) return json({ error: 'Prise introuvable.' }, { status: 404 })

	const { peaks, duration } = await loadPeaks(id, recording.file_path as string)

	return json({
		peaks,
		duration: (recording.duration_s as number | null) ?? duration
	})
}
