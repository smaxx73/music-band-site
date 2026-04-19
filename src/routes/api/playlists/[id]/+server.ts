import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import sql from '$lib/server/db'

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })

	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	const [playlist] = await sql`SELECT * FROM playlists WHERE id = ${id}`
	if (!playlist) return json({ error: 'Playlist introuvable.' }, { status: 404 })

	const items = await sql`
		SELECT
			pi.id, pi.position, pi.note,
			r.id         AS recording_id,
			r.take,
			r.duration_s,
			r.status     AS recording_status,
			r.file_path,
			s.id         AS song_id,
			s.title      AS song_title,
			s.composer   AS song_composer,
			ses.id       AS session_id,
			ses.date     AS session_date,
			ses.location AS session_location
		FROM playlist_items pi
		JOIN recordings r   ON r.id   = pi.recording_id
		JOIN songs s        ON s.id   = r.song_id
		JOIN sessions ses   ON ses.id = r.session_id
		WHERE pi.playlist_id = ${id}
		ORDER BY pi.position ASC
	`

	return json({ playlist, items })
}
