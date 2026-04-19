import type { PageServerLoad } from './$types'
import { redirect } from '@sveltejs/kit'
import sql from '$lib/server/db'

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(302, '/login')

	const playlists = await sql`
		SELECT p.*, COUNT(pi.id)::int AS item_count
		FROM playlists p
		LEFT JOIN playlist_items pi ON pi.playlist_id = p.id
		GROUP BY p.id
		ORDER BY p.updated_at DESC NULLS LAST, p.created_at DESC
	`

	return { playlists }
}
