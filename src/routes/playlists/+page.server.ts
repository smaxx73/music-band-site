import type { PageServerLoad } from './$types'
import { redirect } from '@sveltejs/kit'
import sql from '$lib/server/db'

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(302, '/login')
	if (!locals.user.current_group_id) return { playlists: [] }

	const playlists = await sql`
		SELECT p.*, COALESCE(MAX(u.display_name), p.created_by) AS created_by, COUNT(pi.id)::int AS item_count
		FROM playlists p
		LEFT JOIN users u ON u.id = p.created_by_user_id
		LEFT JOIN playlist_items pi ON pi.playlist_id = p.id
		WHERE p.group_id = ${locals.user.current_group_id}
		GROUP BY p.id
		ORDER BY p.updated_at DESC NULLS LAST, p.created_at DESC
	`

	return { playlists }
}
