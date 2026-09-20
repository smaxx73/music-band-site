import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import sql from '$lib/server/db'

/** POST — programme un morceau à la fin de la setlist (position = MAX + 1) */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const setlistId = parseInt(params.id)
	if (isNaN(setlistId)) return json({ error: 'ID invalide.' }, { status: 400 })

	const body = await request.json()
	const songId: unknown = body.song_id
	if (typeof songId !== 'number' || !Number.isInteger(songId)) {
		return json({ error: 'song_id invalide.' }, { status: 400 })
	}

	const item = await sql.begin(async (tx) => {
		const [setlist] = await tx`
			SELECT id FROM setlists
			WHERE id = ${setlistId} AND group_id = ${locals.user!.current_group_id}
			FOR UPDATE
		`
		if (!setlist) throw Object.assign(new Error(), { code: 'setlist_not_found' })

		const [song] = await tx<{ id: number; status: string }[]>`
			SELECT id, status FROM songs
			WHERE id = ${songId} AND group_id = ${locals.user!.current_group_id}
		`
		if (!song) throw Object.assign(new Error(), { code: 'song_not_found' })
		// Un morceau abandonné ne se programme pas, comme il ne s'upload pas.
		if (song.status === 'abandonne') throw Object.assign(new Error(), { code: 'abandoned' })

		const [existingItem] = await tx`
			SELECT * FROM setlist_items
			WHERE setlist_id = ${setlistId} AND song_id = ${songId}
		`
		if (existingItem) throw Object.assign(new Error(), { code: 'already_added', item: existingItem })

		const [{ next_pos }] = await tx`
			SELECT COALESCE(MAX(position), 0) + 1 AS next_pos
			FROM setlist_items WHERE setlist_id = ${setlistId}
		`
		const [newItem] = await tx`
			INSERT INTO setlist_items (setlist_id, song_id, position)
			VALUES (${setlistId}, ${songId}, ${next_pos})
			RETURNING *
		`
		await tx`UPDATE setlists SET updated_at = now() WHERE id = ${setlistId}`
		return newItem
	}).catch((err: unknown) => {
		const code = (err as { code?: string }).code
		if (code === 'setlist_not_found' || code === 'song_not_found') return null
		if (code === 'abandoned') return 'abandoned' as const
		if (code === 'already_added') return { alreadyAdded: true, item: (err as { item: unknown }).item }
		throw err
	})

	if (!item) return json({ error: 'Setlist ou morceau introuvable.' }, { status: 404 })
	if (item === 'abandoned') {
		return json({ error: 'Ce morceau est abandonné : il ne peut pas être programmé.' }, { status: 400 })
	}
	if ('alreadyAdded' in item) {
		return json(
			{ error: 'Ce morceau est déjà dans cette setlist.', code: 'already_added', item: item.item },
			{ status: 409 }
		)
	}

	return json(item, { status: 201 })
}

/** PATCH — réécrit l'ordre complet du programme dans une transaction */
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const setlistId = parseInt(params.id)
	if (isNaN(setlistId)) return json({ error: 'ID invalide.' }, { status: 400 })

	const body = await request.json()
	if (!Array.isArray(body)) {
		return json({ error: 'Body doit être un tableau [{ id, position }].' }, { status: 400 })
	}

	const updates = body as unknown[]
	for (const u of updates) {
		if (
			typeof u !== 'object' || u === null ||
			typeof (u as Record<string, unknown>).id !== 'number' ||
			typeof (u as Record<string, unknown>).position !== 'number'
		) {
			return json({ error: 'Chaque élément doit avoir id (number) et position (number).' }, { status: 400 })
		}
	}

	const [setlist] = await sql`
		SELECT id FROM setlists
		WHERE id = ${setlistId} AND group_id = ${locals.user.current_group_id}
	`
	if (!setlist) return json({ error: 'Setlist introuvable.' }, { status: 404 })

	await sql.begin(async (tx) => {
		// La contrainte UNIQUE (setlist_id, position) interdirait les états intermédiaires
		// si on mettait à jour position par position : on négatise d'abord tout l'ordre.
		await tx`UPDATE setlist_items SET position = -position WHERE setlist_id = ${setlistId}`
		for (const u of updates as { id: number; position: number }[]) {
			await tx`
				UPDATE setlist_items SET position = ${u.position}
				WHERE id = ${u.id} AND setlist_id = ${setlistId}
			`
		}
		await tx`UPDATE setlists SET updated_at = now() WHERE id = ${setlistId}`
	})

	return json({ success: true })
}
