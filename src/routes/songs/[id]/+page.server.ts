import type { PageServerLoad } from './$types'
import { error, redirect } from '@sveltejs/kit'
import sql from '$lib/server/db'
import { retargetActiveGroup } from '$lib/server/group-scope'
import { loginRedirect } from '$lib/redirect'

export const load: PageServerLoad = async ({ locals, params, cookies, url, isDataRequest }) => {
	if (!locals.user) redirect(302, loginRedirect(url))
	if (!locals.user.current_group_id) error(403, 'Aucun groupe actif')

	const id = parseInt(params.id)
	if (isNaN(id)) error(400, 'ID invalide')

	const [song] = await sql`
		SELECT s.*, floor(EXTRACT(EPOCH FROM sc.updated_at) * 1000)::float8 AS cover_version
		FROM songs s
		LEFT JOIN song_covers sc ON sc.song_id = s.id
		WHERE s.id = ${id} AND s.group_id = ${locals.user.current_group_id}
	`
	if (!song) {
		// Un lien reçu peut viser un autre groupe de l'utilisateur : y basculer plutôt
		// que d'opposer un « introuvable » qui ne dit pas quoi faire.
		await retargetActiveGroup(locals.user, { cookies, url, isDataRequest }, 'song', id)
		error(404, 'Morceau introuvable')
	}

	const recordings = await sql`
		SELECT
			r.id, r.take, r.status, r.notes, r.duration_s, COALESCE(MAX(u.display_name), r.uploaded_by) AS uploaded_by, r.created_at,
			r.file_path, r.source_file_name, r.youtube_video_id, r.youtube_title,
			ses.id       AS session_id,
			ses.date     AS session_date,
			ses.location AS session_location,
			COUNT(c.id)::int AS comment_count,
			(SELECT COUNT(*)::int FROM share_links sl WHERE sl.recording_id = r.id AND sl.expires_at > now()) AS share_count
		FROM recordings r
		JOIN sessions ses ON ses.id = r.session_id
		LEFT JOIN users u ON u.id = r.uploaded_by_user_id
		LEFT JOIN comments c ON c.recording_id = r.id
		WHERE r.song_id = ${id} AND ses.group_id = ${locals.user.current_group_id}
		GROUP BY r.id, ses.id
		ORDER BY ses.date DESC, r.take ASC
	`

	return { song, recordings }
}
