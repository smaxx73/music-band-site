import type { PageServerLoad } from './$types'
import { redirect } from '@sveltejs/kit'
import sql from '$lib/server/db'
import { listRecentImports } from '$lib/server/imports'
import { loginRedirect } from '$lib/redirect'

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(302, loginRedirect(url))
	if (!locals.user.current_group_id) {
		return { sessions: [], songs: [], imports: [], selectedSessionId: '', selectedSongId: '' }
	}

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

	// Une arrivée depuis une session porte son identifiant dans l'URL. Le valider
	// contre les sessions du groupe avant de le renvoyer : l'interface peut ainsi
	// présélectionner la bonne session dès le rendu serveur.
	const requestedSessionId = url.searchParams.get('session_id')
	const selectedSessionId = sessions.some((session) => String(session.id) === requestedSessionId)
		? requestedSessionId!
		: ''
	const requestedSongId = url.searchParams.get('song_id')
	const selectedSongId = songs.some((song) => String(song.id) === requestedSongId)
		? requestedSongId!
		: ''

	return { sessions, songs, imports, selectedSessionId, selectedSongId }
}
