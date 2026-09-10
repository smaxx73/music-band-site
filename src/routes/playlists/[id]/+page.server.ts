import type { PageServerLoad } from './$types'
import { error, redirect } from '@sveltejs/kit'
import sql from '$lib/server/db'
import { loadPeaks } from '$lib/server/peaks'

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) redirect(302, '/login')
	if (!locals.user.current_group_id) error(403, 'Aucun groupe actif')

	const id = parseInt(params.id)
	if (isNaN(id)) error(400, 'ID invalide')

	const [playlist] = await sql`
		SELECT p.*, COALESCE(u.display_name, p.created_by) AS created_by
		FROM playlists p
		LEFT JOIN users u ON u.id = p.created_by_user_id
		WHERE p.id = ${id} AND p.group_id = ${locals.user.current_group_id}
	`
	if (!playlist) error(404, 'Playlist introuvable')

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
			s.lyrics     AS song_lyrics,
			s.music_notes AS song_music_notes,
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

	const peaksArr = await Promise.all(
		(items as unknown as { recording_id: number; file_path: string }[]).map(
			(item) => loadPeaks(item.recording_id, item.file_path)
		)
	)
	const peaks: Record<number, number[]> = {}
	const durations: Record<number, number | null> = {}
	;(items as unknown as { recording_id: number }[]).forEach((item, i) => {
		peaks[item.recording_id] = peaksArr[i].peaks
		durations[item.recording_id] = peaksArr[i].duration
	})

	return { playlist, items, peaks, durations }
}
