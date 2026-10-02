import type { PageServerLoad } from './$types'
import { redirect } from '@sveltejs/kit'
import sql from '$lib/server/db'
import { listGroupMemberNames } from '$lib/server/groups'
import { loginRedirect } from '$lib/redirect'

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(302, loginRedirect(url))
	if (!locals.user.current_group_id) return { sessions: [], groupMembers: [] }

	const sessions = await sql`
		SELECT
			s.*, COALESCE(MAX(u.display_name), s.created_by) AS created_by,
			floor(EXTRACT(EPOCH FROM sp.updated_at) * 1000)::float8 AS photo_version,
			sp.veil AS photo_veil,
			COUNT(DISTINCT r.song_id)::int AS song_count,
			COUNT(r.id)::int               AS recording_count,
			COALESCE(SUM(r.duration_s), 0)::float8 AS total_duration_s,
			-- Ce qu'on cherche d'une session passée, c'est d'abord ce qu'on y a joué.
			COALESCE(array_agg(DISTINCT so.title) FILTER (WHERE so.id IS NOT NULL), '{}') AS song_titles
		FROM sessions s
		LEFT JOIN users u ON u.id = s.created_by_user_id
		LEFT JOIN recordings r ON r.session_id = s.id
		LEFT JOIN songs so ON so.id = r.song_id
		LEFT JOIN session_photos sp ON sp.session_id = s.id
		WHERE s.group_id = ${locals.user.current_group_id}
		GROUP BY s.id, sp.session_id
		ORDER BY s.date DESC
	`

	// Participants proposés à la création d'une session : les membres du groupe actif.
	const groupMembers = await listGroupMemberNames(locals.user.current_group_id)

	return { sessions, groupMembers }
}
