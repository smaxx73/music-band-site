import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import sql from '$lib/server/db'

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (locals.user.role !== 'admin') return json({ error: 'Réservé aux administrateurs.' }, { status: 403 })

	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	const [group] = await sql`SELECT * FROM groups WHERE id = ${id}`
	if (!group) return json({ error: 'Groupe introuvable.' }, { status: 404 })

	return json(group)
}

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (locals.user.role !== 'admin') return json({ error: 'Réservé aux administrateurs.' }, { status: 403 })

	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	const body = await request.json()
	const name: unknown = body.name

	if (typeof name !== 'string' || !name.trim()) {
		return json({ error: 'Le nom est obligatoire.' }, { status: 400 })
	}

	try {
		const [group] = await sql`
			UPDATE groups SET name = ${name.trim()} WHERE id = ${id} RETURNING *
		`
		if (!group) return json({ error: 'Groupe introuvable.' }, { status: 404 })
		return json(group)
	} catch (err) {
		if (isUniqueViolation(err)) return json({ error: 'Ce nom existe déjà.' }, { status: 409 })
		throw err
	}
}

export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (locals.user.role !== 'admin') return json({ error: 'Réservé aux administrateurs.' }, { status: 403 })

	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	const [{ count }] = await sql`
		SELECT COUNT(*)::int AS count FROM sessions WHERE group_id = ${id}
	`
	if (count > 0) {
		return json(
			{ error: 'Impossible de supprimer : des sessions existent pour ce groupe.' },
			{ status: 409 }
		)
	}

	const [deleted] = await sql`DELETE FROM groups WHERE id = ${id} RETURNING id`
	if (!deleted) return json({ error: 'Groupe introuvable.' }, { status: 404 })

	return json({ success: true })
}

function isUniqueViolation(err: unknown): boolean {
	return (
		typeof err === 'object' &&
		err !== null &&
		'code' in err &&
		(err as { code: string }).code === '23505'
	)
}
