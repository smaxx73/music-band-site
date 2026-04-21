import type { PageServerLoad, Actions } from './$types'
import { error, fail } from '@sveltejs/kit'
import sql from '$lib/server/db'

export const load: PageServerLoad = async () => {
	const songs = await sql`
		SELECT s.*, COUNT(r.id)::int AS take_count
		FROM songs s
		LEFT JOIN recordings r ON r.song_id = s.id
		GROUP BY s.id
		ORDER BY s.title
	`

	return { songs }
}

const VALID_STATUSES = ['en_apprentissage', 'au_repertoire', 'abandonne']

export const actions: Actions = {
	create: async ({ request, locals }) => {
		if (locals.user?.role !== 'admin') error(403, 'Accès réservé aux administrateurs')

		const data = await request.formData()
		const title = (data.get('title') as string | null)?.trim()
		const composer = (data.get('composer') as string | null)?.trim() || null
		const key = (data.get('key') as string | null)?.trim() || null
		const status = (data.get('status') as string | null) ?? 'en_apprentissage'

		if (!title) return fail(400, { action: 'create', error: 'Le titre est obligatoire.' })
		if (!VALID_STATUSES.includes(status))
			return fail(400, { action: 'create', error: 'Statut invalide.' })

		try {
			await sql`
				INSERT INTO songs (title, composer, key, status)
				VALUES (${title}, ${composer}, ${key}, ${status})
			`
		} catch (err) {
			if (isUniqueViolation(err))
				return fail(409, { action: 'create', error: 'Ce titre existe déjà.' })
			throw err
		}
	},

	update: async ({ request, locals }) => {
		if (locals.user?.role !== 'admin') error(403, 'Accès réservé aux administrateurs')

		const data = await request.formData()
		const id = parseInt(data.get('id') as string)
		const title = (data.get('title') as string | null)?.trim()
		const composer = (data.get('composer') as string | null)?.trim() || null
		const key = (data.get('key') as string | null)?.trim() || null
		const status = data.get('status') as string | null

		if (isNaN(id)) return fail(400, { action: 'update', id, error: 'ID invalide.' })
		if (!title) return fail(400, { action: 'update', id, error: 'Le titre est obligatoire.' })
		if (!status || !VALID_STATUSES.includes(status))
			return fail(400, { action: 'update', id, error: 'Statut invalide.' })

		try {
			const [song] = await sql`
				UPDATE songs SET title = ${title}, composer = ${composer}, key = ${key}, status = ${status}
				WHERE id = ${id}
				RETURNING id
			`
			if (!song) return fail(404, { action: 'update', id, error: 'Morceau introuvable.' })
		} catch (err) {
			if (isUniqueViolation(err))
				return fail(409, { action: 'update', id, error: 'Ce titre existe déjà.' })
			throw err
		}
	},

	delete: async ({ request, locals }) => {
		if (locals.user?.role !== 'admin') error(403, 'Accès réservé aux administrateurs')

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

		const [deleted] = await sql`DELETE FROM songs WHERE id = ${id} RETURNING id`
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
