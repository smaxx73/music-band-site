import type { PageServerLoad, Actions } from './$types'
import { error, fail, redirect } from '@sveltejs/kit'
import sql from '$lib/server/db'
import type { Song } from '$lib/types'

type SongWithTakeCount = Song & { take_count: number }

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(302, '/login')
	if (!locals.user.current_group_id) return { songs: [] }

	const songs = await sql<SongWithTakeCount[]>`
		SELECT s.*, COUNT(r.id)::int AS take_count
		FROM songs s
		LEFT JOIN recordings r ON r.song_id = s.id
		WHERE s.group_id = ${locals.user.current_group_id}
		GROUP BY s.id
		ORDER BY s.title
	`

	return { songs }
}

const VALID_STATUSES = ['en_apprentissage', 'au_repertoire', 'abandonne']

const INVALID = Symbol('invalid')

/** Année à 4 chiffres, ou vide → null. */
function parseYear(raw: string | null): number | null | typeof INVALID {
	const trimmed = raw?.trim()
	if (!trimmed) return null
	if (!/^\d{4}$/.test(trimmed)) return INVALID
	return Number(trimmed)
}

/** "3:45" ou "225" (secondes) ; vide → null. */
function parseDuration(raw: string | null): number | null | typeof INVALID {
	const trimmed = raw?.trim()
	if (!trimmed) return null
	const match = trimmed.match(/^(\d+):([0-5]\d)$/)
	if (match) return Number(match[1]) * 60 + Number(match[2])
	if (/^\d+$/.test(trimmed)) return Number(trimmed)
	return INVALID
}

// Le référentiel de morceaux est géré par tout membre du groupe actif, pas seulement les admins.
export const actions: Actions = {
	create: async ({ request, locals }) => {
		if (!locals.user) error(401, 'Non autorisé')
		if (!locals.user.current_group_id)
			return fail(400, { action: 'create', error: 'Aucun groupe actif.' })

		const data = await request.formData()
		const title = (data.get('title') as string | null)?.trim()
		const composer = (data.get('composer') as string | null)?.trim() || null
		const key = (data.get('key') as string | null)?.trim() || null
		const original_artist = (data.get('original_artist') as string | null)?.trim() || null
		const lyrics = (data.get('lyrics') as string | null)?.trim() || null
		const music_notes = (data.get('music_notes') as string | null)?.trim() || null
		const status = (data.get('status') as string | null) ?? 'en_apprentissage'

		if (!title) return fail(400, { action: 'create', error: 'Le titre est obligatoire.' })
		if (!VALID_STATUSES.includes(status))
			return fail(400, { action: 'create', error: 'Statut invalide.' })

		const release_year = parseYear(data.get('release_year') as string | null)
		if (release_year === INVALID)
			return fail(400, { action: 'create', error: 'Année de sortie invalide (AAAA).' })
		const reference_duration_s = parseDuration(data.get('reference_duration') as string | null)
		if (reference_duration_s === INVALID)
			return fail(400, { action: 'create', error: 'Durée de référence invalide (mm:ss).' })

		try {
			await sql`
				INSERT INTO songs (
					group_id, title, composer, key, release_year, original_artist,
					reference_duration_s, lyrics, music_notes, status
				)
				VALUES (
					${locals.user.current_group_id},
					${title},
					${composer},
					${key},
					${release_year},
					${original_artist},
					${reference_duration_s},
					${lyrics},
					${music_notes},
					${status}
				)
			`
		} catch (err) {
			if (isUniqueViolation(err))
				return fail(409, { action: 'create', error: 'Ce titre existe déjà dans ce groupe.' })
			throw err
		}
	},

	update: async ({ request, locals }) => {
		if (!locals.user) error(401, 'Non autorisé')
		if (!locals.user.current_group_id)
			return fail(400, { action: 'update', error: 'Aucun groupe actif.' })

		const data = await request.formData()
		const id = parseInt(data.get('id') as string)
		const title = (data.get('title') as string | null)?.trim()
		const composer = (data.get('composer') as string | null)?.trim() || null
		const key = (data.get('key') as string | null)?.trim() || null
		const original_artist = (data.get('original_artist') as string | null)?.trim() || null
		const lyrics = (data.get('lyrics') as string | null)?.trim() || null
		const music_notes = (data.get('music_notes') as string | null)?.trim() || null
		const status = data.get('status') as string | null

		if (isNaN(id)) return fail(400, { action: 'update', id, error: 'ID invalide.' })
		if (!title) return fail(400, { action: 'update', id, error: 'Le titre est obligatoire.' })
		if (!status || !VALID_STATUSES.includes(status))
			return fail(400, { action: 'update', id, error: 'Statut invalide.' })

		const release_year = parseYear(data.get('release_year') as string | null)
		if (release_year === INVALID)
			return fail(400, { action: 'update', id, error: 'Année de sortie invalide (AAAA).' })
		const reference_duration_s = parseDuration(data.get('reference_duration') as string | null)
		if (reference_duration_s === INVALID)
			return fail(400, { action: 'update', id, error: 'Durée de référence invalide (mm:ss).' })

		try {
			const [song] = await sql`
				UPDATE songs
				SET title = ${title},
					composer = ${composer},
					key = ${key},
					release_year = ${release_year},
					original_artist = ${original_artist},
					reference_duration_s = ${reference_duration_s},
					lyrics = ${lyrics},
					music_notes = ${music_notes},
					status = ${status}
				WHERE id = ${id} AND group_id = ${locals.user.current_group_id}
				RETURNING id
			`
			if (!song) return fail(404, { action: 'update', id, error: 'Morceau introuvable.' })
		} catch (err) {
			if (isUniqueViolation(err))
				return fail(409, { action: 'update', id, error: 'Ce titre existe déjà dans ce groupe.' })
			throw err
		}
	},

	delete: async ({ request, locals }) => {
		if (!locals.user) error(401, 'Non autorisé')
		if (!locals.user.current_group_id)
			return fail(400, { action: 'delete', error: 'Aucun groupe actif.' })

		const data = await request.formData()
		const id = parseInt(data.get('id') as string)
		if (isNaN(id)) return fail(400, { action: 'delete', error: 'ID invalide.' })

		const [{ count }] = await sql`
			SELECT COUNT(*)::int AS count FROM recordings WHERE song_id = ${id}
		`
		if (count > 0) {
			return fail(409, {
				action: 'delete',
				id,
				error: 'Impossible de supprimer : des prises existent pour ce morceau.'
			})
		}

		const [deleted] = await sql`
			DELETE FROM songs WHERE id = ${id} AND group_id = ${locals.user.current_group_id}
			RETURNING id
		`
		if (!deleted) return fail(404, { action: 'delete', id, error: 'Morceau introuvable.' })
	}
}

function isUniqueViolation(err: unknown): boolean {
	return (
		typeof err === 'object' &&
		err !== null &&
		'code' in err &&
		(err as { code: string }).code === '23505'
	)
}
