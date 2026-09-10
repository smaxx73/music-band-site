import type { PageServerLoad } from './$types'
import { error, redirect } from '@sveltejs/kit'
import sql from '$lib/server/db'

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) redirect(302, '/login')
	if (!locals.user.current_group_id) error(403, 'Aucun groupe actif')

	const id = parseInt(params.id)
	if (isNaN(id)) error(400, 'ID invalide')

	const [session] = await sql`
		SELECT s.*, COALESCE(u.display_name, s.created_by) AS created_by
		FROM sessions s
		LEFT JOIN users u ON u.id = s.created_by_user_id
		WHERE s.id = ${id} AND s.group_id = ${locals.user.current_group_id}
	`
	if (!session) error(404, 'Session introuvable')

	// Sessions adjacentes du groupe, pour la navigation précédent/suivant.
	// Le tuple (date, id) départage les sessions d'une même journée. La comparaison
	// reste entièrement en SQL : renvoyer la date via JS la ferait transiter par un
	// timestamp et risquerait un décalage d'un jour selon le fuseau.
	const [[prevSession], [nextSession]] = await Promise.all([
		sql`
			SELECT id, date, title, type FROM sessions
			WHERE group_id = ${locals.user.current_group_id}
			  AND (date, id) < (SELECT date, id FROM sessions WHERE id = ${id})
			ORDER BY date DESC, id DESC
			LIMIT 1
		`,
		sql`
			SELECT id, date, title, type FROM sessions
			WHERE group_id = ${locals.user.current_group_id}
			  AND (date, id) > (SELECT date, id FROM sessions WHERE id = ${id})
			ORDER BY date ASC, id ASC
			LIMIT 1
		`
	])

	const rows = await sql`
		SELECT
			r.id, r.take, r.status, r.notes, r.duration_s, COALESCE(MAX(u.display_name), r.uploaded_by) AS uploaded_by,
			r.uploaded_by_user_id, r.created_at, r.file_path,
			s.id       AS song_id,
			s.title    AS song_title,
			s.composer AS song_composer,
			s.lyrics   AS song_lyrics,
			s.music_notes AS song_music_notes,
			s.status   AS song_status,
			COUNT(c.id)::int AS comment_count
		FROM recordings r
		JOIN songs s ON s.id = r.song_id
		LEFT JOIN users u ON u.id = r.uploaded_by_user_id
		LEFT JOIN comments c ON c.recording_id = r.id
		WHERE r.session_id = ${id}
		GROUP BY r.id, s.id
		ORDER BY s.title, r.take ASC
	`

	// Grouper par morceau côté serveur
	const groupMap = new Map<number, {
		song: {
			id: number
			title: string
			composer: string | null
			lyrics: string | null
			music_notes: string | null
			status: string
		}
		recordings: {
			id: number; take: number; status: string; notes: string | null
			duration_s: number | null; uploaded_by: string; uploaded_by_user_id: number | null
			comment_count: number; file_path: string
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
					lyrics: row.song_lyrics,
					music_notes: row.song_music_notes,
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
			// Sert à décider côté écran qui peut supprimer la prise (voir canDeleteGroupContent).
			uploaded_by_user_id: row.uploaded_by_user_id,
			comment_count: row.comment_count,
			file_path: row.file_path
		})
	}

	return {
		session,
		groups: Array.from(groupMap.values()),
		prevSession: prevSession ?? null,
		nextSession: nextSession ?? null
	}
}
