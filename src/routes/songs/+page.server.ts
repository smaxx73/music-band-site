import type { PageServerLoad, Actions } from './$types'
import { error, fail, redirect } from '@sveltejs/kit'
import sql from '$lib/server/db'
import { deleteSong, importCatalogCover, isUniqueViolation, parseSongForm, updateSong } from '$lib/server/songs'
import type { Song } from '$lib/types'
import { loginRedirect } from '$lib/redirect'

type SongWithTakeCount = Song & { take_count: number; cover_version: number | null }

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(302, loginRedirect(url))
	if (!locals.user.current_group_id) return { songs: [] }

	const songs = await sql<SongWithTakeCount[]>`
		SELECT s.*, COUNT(r.id)::int AS take_count,
		       floor(EXTRACT(EPOCH FROM sc.updated_at) * 1000)::float8 AS cover_version
		FROM songs s
		LEFT JOIN recordings r ON r.song_id = s.id
		LEFT JOIN song_covers sc ON sc.song_id = s.id
		WHERE s.group_id = ${locals.user.current_group_id}
		GROUP BY s.id, sc.updated_at
		ORDER BY s.title
	`

	return { songs }
}

// Le référentiel de morceaux est géré par tout membre du groupe actif, pas seulement les admins.
export const actions: Actions = {
	create: async ({ request, locals }) => {
		if (!locals.user) error(401, 'Non autorisé')
		if (!locals.user.current_group_id)
			return fail(400, { action: 'create', error: 'Aucun groupe actif.' })

		const data = await request.formData()
		const parsed = parseSongForm(data)
		if (!parsed.ok) return fail(400, { action: 'create', error: parsed.error })
		const f = parsed.fields

		let songId: number
		try {
			const [song] = await sql<{ id: number }[]>`
				INSERT INTO songs (
					group_id, title, composer, key, release_year, original_artist,
					reference_duration_s, tempo_bpm, lyrics, music_notes, status
				)
				VALUES (
					${locals.user.current_group_id},
					${f.title},
					${f.composer},
					${f.key},
					${f.release_year},
					${f.original_artist},
					${f.reference_duration_s},
					${f.tempo_bpm},
					${f.lyrics},
					${f.music_notes},
					${f.status}
				)
				RETURNING id
			`
			songId = song.id
		} catch (err) {
			if (isUniqueViolation(err))
				return fail(409, { action: 'create', error: 'Ce titre existe déjà dans ce groupe.' })
			throw err
		}

		return {
			action: 'create',
			cover_error: await importCatalogCover(locals.user.current_group_id, locals.user.id, songId, data)
		}
	},

	update: async ({ request, locals }) => {
		if (!locals.user) error(401, 'Non autorisé')
		if (!locals.user.current_group_id)
			return fail(400, { action: 'update', error: 'Aucun groupe actif.' })

		const data = await request.formData()
		const id = parseInt(data.get('id') as string)
		if (isNaN(id)) return fail(400, { action: 'update', id, error: 'ID invalide.' })
		const parsed = parseSongForm(data)
		if (!parsed.ok) return fail(400, { action: 'update', id, error: parsed.error })
		const result = await updateSong(locals.user.current_group_id, id, parsed.fields)
		if (!result.ok) return fail(result.status, { action: 'update', id, error: result.error })

		return {
			action: 'update',
			cover_error: await importCatalogCover(locals.user.current_group_id, locals.user.id, id, data)
		}
	},

	delete: async ({ request, locals }) => {
		if (!locals.user) error(401, 'Non autorisé')
		if (!locals.user.current_group_id)
			return fail(400, { action: 'delete', error: 'Aucun groupe actif.' })

		const data = await request.formData()
		const id = parseInt(data.get('id') as string)
		if (isNaN(id)) return fail(400, { action: 'delete', error: 'ID invalide.' })

		const result = await deleteSong(locals.user.current_group_id, id)
		if (!result.ok) return fail(result.status, { action: 'delete', id, error: result.error })
	}
}
