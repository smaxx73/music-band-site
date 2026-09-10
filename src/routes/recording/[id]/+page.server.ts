import type { PageServerLoad } from './$types'
import { error, redirect } from '@sveltejs/kit'
import sql from '$lib/server/db'
import { loadPeaks } from '$lib/server/peaks'
import { commentsWithReactions } from '$lib/server/comments'

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) redirect(302, '/login')
	if (!locals.user.current_group_id) error(403, 'Aucun groupe actif')

	const id = parseInt(params.id)
	if (isNaN(id)) error(400, 'ID invalide')

	const [recording] = await sql`
		SELECT
			r.*,
			COALESCE(u.display_name, r.uploaded_by) AS uploaded_by,
			s.title      AS song_title,
			s.composer   AS song_composer,
			s.key        AS song_key,
			s.lyrics     AS song_lyrics,
			s.music_notes AS song_music_notes,
			ses.date     AS session_date,
			ses.location AS session_location
		FROM recordings r
		JOIN songs    s   ON s.id   = r.song_id
		JOIN sessions ses ON ses.id = r.session_id
		LEFT JOIN users u ON u.id = r.uploaded_by_user_id
		WHERE r.id = ${id} AND ses.group_id = ${locals.user.current_group_id}
	`

	if (!recording) error(404, 'Prise introuvable')

	const [comments, peaksData, siblings] = await Promise.all([
		commentsWithReactions(id, locals.user.id),
		loadPeaks(id, recording.file_path as string),
		sql`
			SELECT id, take FROM recordings
			WHERE session_id = ${recording.session_id} AND song_id = ${recording.song_id}
			ORDER BY take ASC
		`
	])

	const siblingList = siblings as unknown as { id: number; take: number }[]
	const siblingIdx = siblingList.findIndex((r) => Number(r.id) === id)
	const prevRecording = siblingIdx > 0
		? { id: Number(siblingList[siblingIdx - 1].id), take: Number(siblingList[siblingIdx - 1].take) }
		: null
	const nextRecording = siblingIdx !== -1 && siblingIdx < siblingList.length - 1
		? { id: Number(siblingList[siblingIdx + 1].id), take: Number(siblingList[siblingIdx + 1].take) }
		: null

	return {
		recording,
		comments,
		peaks: peaksData.peaks,
		peaksDuration: peaksData.duration,
		user: locals.user?.display_name ?? null,
		prevRecording,
		nextRecording
	}
}
