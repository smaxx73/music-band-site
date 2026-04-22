import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import sql from '$lib/server/db'

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })

	if (locals.user.role === 'admin') {
		const groups = await sql`
			SELECT g.*, COUNT(ug.user_id)::int AS member_count
			FROM groups g
			LEFT JOIN user_groups ug ON ug.group_id = g.id
			GROUP BY g.id
			ORDER BY g.name
		`
		return json(groups)
	}

	return json(locals.user.groups)
}

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (locals.user.role !== 'admin') return json({ error: 'Réservé aux administrateurs.' }, { status: 403 })

	const body = await request.json()
	const name: unknown = body.name

	if (typeof name !== 'string' || !name.trim()) {
		return json({ error: 'Le nom du groupe est obligatoire.' }, { status: 400 })
	}

	try {
		const [group] = await sql`
			INSERT INTO groups (name, created_by)
			VALUES (${name.trim()}, ${locals.user.id})
			RETURNING *
		`
		return json(group, { status: 201 })
	} catch (err) {
		if (isUniqueViolation(err)) {
			return json({ error: 'Ce nom de groupe existe déjà.' }, { status: 409 })
		}
		throw err
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
