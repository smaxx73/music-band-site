import type { PageServerLoad } from './$types'
import { redirect } from '@sveltejs/kit'
import sql from '$lib/server/db'

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(302, '/login')
	if (!locals.user.current_group_id) return { songs: [] }

	const songs = await sql`
		SELECT * FROM songs
		WHERE group_id = ${locals.user.current_group_id} AND status != 'abandonne'
		ORDER BY title
	`

	return { songs }
}
