import type { PageServerLoad } from './$types'
import { error, redirect } from '@sveltejs/kit'
import { readFile, writeFile } from 'fs/promises'
import sql from '$lib/server/db'
import { extractPeaks, getDuration } from '$lib/server/ffmpeg'
import { env } from '$env/dynamic/private'

type PeaksCache = { peaks: number[]; duration: number | null }

async function loadPeaks(id: number, filePath: string): Promise<PeaksCache> {
	const audioDir = env.AUDIO_DIR ?? '/data/audio'
	const peaksPath = `${audioDir}/${id}.peaks.json`
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

	const [recording] = await sql`
		SELECT
			r.*,
			s.title      AS song_title,
			s.composer   AS song_composer,
			s.key        AS song_key,
			ses.date     AS session_date,
			ses.location AS session_location
		FROM recordings r
		JOIN songs    s   ON s.id   = r.song_id
		JOIN sessions ses ON ses.id = r.session_id
		WHERE r.id = ${id}
	`

	if (!recording) error(404, 'Prise introuvable')

	const [comments, peaksData] = await Promise.all([
		sql`
			SELECT * FROM comments
			WHERE recording_id = ${id}
			ORDER BY timestamp_s ASC NULLS LAST, created_at ASC
		`,
		loadPeaks(id, recording.file_path as string)
	])

	return {
		recording,
		comments,
		peaks: peaksData.peaks,
		peaksDuration: peaksData.duration,
		user: locals.user?.name ?? null
	}
}
