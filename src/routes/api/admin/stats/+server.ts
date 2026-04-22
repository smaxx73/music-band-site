import type { RequestHandler } from './$types'
import { AUDIO_DIR } from '$env/static/private'
import { json } from '@sveltejs/kit'
import sql from '$lib/server/db'
import { readdir, stat } from 'fs/promises'
import { join } from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })

	const groupId = locals.user.current_group_id

	const [counts] = groupId
		? await sql`
			SELECT
				(SELECT COUNT(*)::int FROM songs     WHERE group_id = ${groupId}) AS songs,
				(SELECT COUNT(*)::int FROM sessions  WHERE group_id = ${groupId}) AS sessions,
				(SELECT COUNT(*)::int FROM recordings r
				 JOIN sessions s ON s.id = r.session_id WHERE s.group_id = ${groupId}) AS recordings,
				(SELECT COUNT(*)::int FROM comments c
				 JOIN recordings r ON r.id = c.recording_id
				 JOIN sessions s   ON s.id = r.session_id WHERE s.group_id = ${groupId}) AS comments,
				(SELECT COUNT(*)::int FROM playlists  WHERE group_id = ${groupId}) AS playlists
		`
		: await sql`
			SELECT
				(SELECT COUNT(*)::int FROM songs)      AS songs,
				(SELECT COUNT(*)::int FROM sessions)   AS sessions,
				(SELECT COUNT(*)::int FROM recordings) AS recordings,
				(SELECT COUNT(*)::int FROM comments)   AS comments,
				(SELECT COUNT(*)::int FROM playlists)  AS playlists
		`

	// Taille totale des fichiers audio
	let audioBytes = 0
	let audioFiles = 0
	try {
		const files = await readdir(AUDIO_DIR)
		const sizes = await Promise.all(
			files
				.filter((f) => f.endsWith('.mp3'))
				.map(async (f) => {
					const s = await stat(join(AUDIO_DIR, f))
					return s.size
				})
		)
		audioFiles = sizes.length
		audioBytes = sizes.reduce((a, b) => a + b, 0)
	} catch {
		// AUDIO_DIR inexistant ou inaccessible — on renvoie 0
	}

	// Espace disque via df
	let diskUsed = 0
	let diskAvailable = 0
	let diskTotal = 0
	try {
		const { stdout } = await execFileAsync('df', ['-k', '--output=used,avail,size', AUDIO_DIR])
		const lines = stdout.trim().split('\n')
		if (lines.length >= 2) {
			const parts = lines[1].trim().split(/\s+/)
			diskUsed = parseInt(parts[0]) * 1024
			diskAvailable = parseInt(parts[1]) * 1024
			diskTotal = parseInt(parts[2]) * 1024
		}
	} catch {
		// df indisponible (Windows, etc.)
	}

	return json({
		counts: {
			songs: counts.songs,
			sessions: counts.sessions,
			recordings: counts.recordings,
			comments: counts.comments,
			playlists: counts.playlists
		},
		audio: {
			files: audioFiles,
			bytes: audioBytes
		},
		disk: {
			used: diskUsed,
			available: diskAvailable,
			total: diskTotal
		}
	})
}
