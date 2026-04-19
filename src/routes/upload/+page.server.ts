import type { PageServerLoad } from './$types'
import { redirect } from '@sveltejs/kit'
import sql from '$lib/server/db'

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(302, '/login')

	const [sessions, songs] = await Promise.all([
		sql`SELECT id, date, location FROM sessions ORDER BY date DESC`,
		sql`SELECT id, title FROM songs WHERE status != 'abandonne' ORDER BY title`
	])

	return { sessions, songs, user: locals.user }
}
