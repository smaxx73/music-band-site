import type { PageServerLoad } from './$types'
import { error, redirect } from '@sveltejs/kit'
import sql from '$lib/server/db'

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) redirect(302, '/login')

	const id = parseInt(params.id)
	if (isNaN(id)) error(400, 'ID invalide')

	const [session] = await sql`SELECT * FROM sessions WHERE id = ${id}`
	if (!session) error(404, 'Session introuvable')

	const rows = await sql`
		SELECT
			r.id, r.take, r.status, r.notes, r.duration_s, r.uploaded_by, r.created_at, r.file_path,
			s.id       AS song_id,
			s.title    AS song_title,
			s.composer AS song_composer,
			s.status   AS song_status,
			COUNT(c.id)::int AS comment_count
		FROM recordings r
		JOIN songs s ON s.id = r.song_id
		LEFT JOIN comments c ON c.recording_id = r.id
		WHERE r.session_id = ${id}
		GROUP BY r.id, s.id
		ORDER BY s.title, r.take ASC
	`

	// Grouper par morceau côté serveur
	const groupMap = new Map<number, {
		song: { id: number; title: string; composer: string | null; status: string }
		recordings: {
			id: number; take: number; status: string; notes: string | null
			duration_s: number | null; uploaded_by: string; comment_count: number; file_path: string
		}[]
	}>()

	for (const row of rows) {
		const sid = row.song_id as number
		if (!groupMap.has(sid)) {
			groupMap.set(sid, {
				song: {
					id: row.song_id,
					title: row.song_title,
					composer: row.song_composer,
					status: row.song_status
				},
				recordings: []
			})
		}
		groupMap.get(sid)!.recordings.push({
			id: row.id,
			take: row.take,
			status: row.status,
			notes: row.notes,
			duration_s: row.duration_s,
			uploaded_by: row.uploaded_by,
			comment_count: row.comment_count,
			file_path: row.file_path
		})
	}

	return { session, groups: Array.from(groupMap.values()) }
}
