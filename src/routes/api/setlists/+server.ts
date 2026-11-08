import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import sql from '$lib/server/db'
import { listSetlists } from '$lib/server/setlists'
import { notifyGroup } from '$lib/server/notifications'

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	// `?song_id=` : chaque setlist dit en plus si elle programme déjà ce morceau,
	// pour le sélecteur « ajouter à une setlist » d'une vue morceau.
	const songParam = url.searchParams.get('song_id')
	let songId: number | null = null
	if (songParam !== null) {
		const parsedId = Number(songParam)
		if (!Number.isInteger(parsedId) || parsedId < 1) {
			return json({ error: 'song_id invalide.' }, { status: 400 })
		}
		songId = parsedId
	}

	return json(await listSetlists(locals.user.current_group_id, songId))
}

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const body = await request.json()
	const name: unknown = body.name
	const description: unknown = body.description
	const songId: unknown = body.song_id

	if (typeof name !== 'string' || !name.trim()) {
		return json({ error: 'Le nom est obligatoire.' }, { status: 400 })
	}

	if (songId !== undefined && (typeof songId !== 'number' || !Number.isInteger(songId) || songId < 1)) {
		return json({ error: 'song_id invalide.' }, { status: 400 })
	}
	const selectedSongId = songId === undefined ? null : songId as number

	const playlistId: unknown = body.playlist_id
	if (playlistId !== undefined && (typeof playlistId !== 'number' || !Number.isInteger(playlistId) || playlistId < 1)) {
		return json({ error: 'playlist_id invalide.' }, { status: 400 })
	}
	if (playlistId !== undefined && selectedSongId !== null) {
		return json({ error: 'song_id et playlist_id ne vont pas ensemble.' }, { status: 400 })
	}
	const selectedPlaylistId = playlistId === undefined ? null : playlistId as number

	// La création depuis le sélecteur d'un morceau ou depuis une playlist est atomique : une
	// erreur ne laisse pas derrière elle une setlist vide que l'utilisateur n'avait pas demandée.
	const created = await sql.begin(async (tx) => {
		const [setlist] = await tx`
			INSERT INTO setlists (group_id, name, description, created_by, created_by_user_id)
			VALUES (
				${locals.user!.current_group_id},
				${name.trim()},
				${typeof description === 'string' && description.trim() ? description.trim() : null},
				${locals.user!.display_name},
				${locals.user!.id}
			)
			RETURNING *
		`

		if (selectedPlaylistId !== null) {
			const [playlist] = await tx`
				SELECT id FROM playlists
				WHERE id = ${selectedPlaylistId} AND group_id = ${locals.user!.current_group_id}
			`
			if (!playlist) throw Object.assign(new Error(), { code: 'playlist_not_found' })

			// Une playlist vise des prises, une setlist des morceaux : plusieurs prises d'un même
			// morceau n'en font qu'un, à la place de la première. Rien ne relie ensuite les deux.
			const items = await tx`
				INSERT INTO setlist_items (setlist_id, song_id, position)
				SELECT ${setlist.id}::int, t.song_id, ROW_NUMBER() OVER (ORDER BY t.first_position)
				FROM (
					SELECT r.song_id, MIN(pi.position) AS first_position
					FROM playlist_items pi
					JOIN recordings r ON r.id = pi.recording_id
					JOIN songs so ON so.id = r.song_id
					WHERE pi.playlist_id = ${selectedPlaylistId}
					  AND so.group_id = ${locals.user!.current_group_id}
					  AND so.status IS DISTINCT FROM 'abandonne'
					GROUP BY r.song_id
				) t
				RETURNING id
			`
			if (items.length === 0) throw Object.assign(new Error(), { code: 'nothing_to_program' })
			return { setlist, item: null }
		}

		if (selectedSongId === null) return { setlist, item: null }

		const [song] = await tx<{ id: number; status: string }[]>`
			SELECT id, status FROM songs
			WHERE id = ${selectedSongId} AND group_id = ${locals.user!.current_group_id}
		`
		if (!song) throw Object.assign(new Error(), { code: 'song_not_found' })
		// Un morceau abandonné ne se programme pas, comme il ne s'upload pas.
		if (song.status === 'abandonne') throw Object.assign(new Error(), { code: 'abandoned' })

		const [item] = await tx`
			INSERT INTO setlist_items (setlist_id, song_id, position)
			VALUES (${setlist.id}, ${selectedSongId}, 1)
			RETURNING *
		`
		return { setlist, item }
	}).catch((err: unknown) => {
		const code = (err as { code?: string }).code
		if (code === 'song_not_found' || code === 'abandoned' || code === 'playlist_not_found' || code === 'nothing_to_program') return code
		throw err
	})

	if (created === 'song_not_found') return json({ error: 'Morceau introuvable.' }, { status: 404 })
	if (created === 'playlist_not_found') return json({ error: 'Playlist introuvable.' }, { status: 404 })
	if (created === 'nothing_to_program') {
		return json({ error: 'Cette playlist ne contient aucun morceau à programmer.' }, { status: 400 })
	}
	if (created === 'abandoned') {
		return json({ error: 'Ce morceau est abandonné : il ne peut pas être programmé.' }, { status: 400 })
	}

	const { setlist, item } = created

	await notifyGroup({
		groupId: locals.user.current_group_id,
		actor: locals.user,
		type: 'setlist',
		subject: setlist.name,
		excerpt: setlist.description,
		link: `/setlists/${setlist.id}`,
		setlistId: setlist.id
	})

	return json({ ...setlist, item }, { status: 201 })
}
