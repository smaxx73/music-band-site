import type { PageServerLoad } from './$types'
import { redirect } from '@sveltejs/kit'
import sql from '$lib/server/db'
import { listGroupMemberNames } from '$lib/server/groups'

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(302, '/login')
	if (!locals.user.current_group_id) return { sessions: [], groupMembers: [] }

	const sessions = await sql`
		SELECT
			s.*, COALESCE(MAX(u.display_name), s.created_by) AS created_by,
			COUNT(DISTINCT r.song_id)::int AS song_count,
			COUNT(r.id)::int               AS recording_count
		FROM sessions s
		LEFT JOIN users u ON u.id = s.created_by_user_id
		LEFT JOIN recordings r ON r.session_id = s.id
		WHERE s.group_id = ${locals.user.current_group_id}
		GROUP BY s.id
		ORDER BY s.date DESC
	`

	// Participants proposés à la création d'une session : les membres du groupe actif.
	const groupMembers = await listGroupMemberNames(locals.user.current_group_id)

	return { sessions, groupMembers }
}
