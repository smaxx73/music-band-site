import type { PageServerLoad } from './$types'
import { redirect } from '@sveltejs/kit'
import sql from '$lib/server/db'
import { listRecentImports } from '$lib/server/imports'

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(302, '/login')
	if (!locals.user.current_group_id) return { sessions: [], songs: [], imports: [] }

	const groupId = locals.user.current_group_id

	const [sessions, songs, imports] = await Promise.all([
		sql`
			SELECT id, date, location
			FROM sessions
			WHERE group_id = ${groupId}
			ORDER BY date DESC
		`,
		sql`
			SELECT id, title, lyrics, music_notes
			FROM songs
			WHERE group_id = ${groupId} AND status != 'abandonne'
			ORDER BY title
		`,
		// Les fichiers longs encore en rétention : c'est par là qu'on reprend une découpe.
		listRecentImports(locals.user.id, groupId)
	])

	return { sessions, songs, imports }
}
