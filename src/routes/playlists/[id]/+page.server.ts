import type { PageServerLoad } from './$types'
import { error, redirect } from '@sveltejs/kit'
import { readFile, writeFile } from 'fs/promises'
import sql from '$lib/server/db'
import { extractPeaks, getDuration } from '$lib/server/ffmpeg'
import { env } from '$env/dynamic/private'

type PeaksCache = { peaks: number[]; duration: number | null }

async function loadPeaks(recordingId: number, filePath: string): Promise<PeaksCache> {
	const audioDir = env.AUDIO_DIR ?? '/data/audio'
	const peaksPath = `${audioDir}/${recordingId}.peaks.json`
	try {
		return JSON.parse(await readFile(peaksPath, 'utf-8')) as PeaksCache
	} catch {
		const fullPath = `${audioDir}/${filePath}`
		const [peaks, duration] = await Promise.all([
			extractPeaks(fullPath),
			getDuration(fullPath)
		])
		if (peaks.length > 0) writeFile(peaksPath, JSON.stringify({ peaks, duration })).catch(() => {})
		return { peaks, duration }
	}
}

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) redirect(302, '/login')

	const id = parseInt(params.id)
	if (isNaN(id)) error(400, 'ID invalide')

	const [playlist] = await sql`SELECT * FROM playlists WHERE id = ${id}`
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
		(items as { recording_id: number; file_path: string }[]).map(
			(item) => loadPeaks(item.recording_id, item.file_path)
		)
	)
	const peaks: Record<number, number[]> = {}
	const durations: Record<number, number | null> = {}
	;(items as { recording_id: number }[]).forEach((item, i) => {
		peaks[item.recording_id] = peaksArr[i].peaks
		durations[item.recording_id] = peaksArr[i].duration
	})

	return { playlist, items, peaks, durations }
}
