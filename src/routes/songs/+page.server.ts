import type { PageServerLoad } from './$types'
import { redirect } from '@sveltejs/kit'
import sql from '$lib/server/db'

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(302, '/login')

	const songs = await sql`
		SELECT * FROM songs
		WHERE status != 'abandonne'
		ORDER BY title
	`

	return { songs }
}
