import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import sql from '$lib/server/db'

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (locals.user.role !== 'admin') return json({ error: 'Réservé aux administrateurs.' }, { status: 403 })

	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	const members = await sql`
		SELECT u.id, u.name, u.role AS global_role, ug.role AS group_role, ug.joined_at
		FROM user_groups ug
		JOIN users u ON u.id = ug.user_id
		WHERE ug.group_id = ${id}
		ORDER BY u.name
	`
	return json(members)
}

export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (locals.user.role !== 'admin') return json({ error: 'Réservé aux administrateurs.' }, { status: 403 })

	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	const body = await request.json()
	const user_id: unknown = body.user_id
	const role: unknown = body.role ?? 'member'

	if (typeof user_id !== 'number' || isNaN(user_id)) {
		return json({ error: 'user_id invalide.' }, { status: 400 })
	}
	if (role !== 'admin' && role !== 'member') {
		return json({ error: 'Rôle invalide (admin | member).' }, { status: 400 })
	}

	const [group] = await sql`SELECT id FROM groups WHERE id = ${id}`
	if (!group) return json({ error: 'Groupe introuvable.' }, { status: 404 })

	const [user] = await sql`SELECT id FROM users WHERE id = ${user_id}`
	if (!user) return json({ error: 'Utilisateur introuvable.' }, { status: 404 })

	const [member] = await sql`
		INSERT INTO user_groups (user_id, group_id, role)
		VALUES (${user_id}, ${id}, ${role})
		ON CONFLICT (user_id, group_id) DO UPDATE SET role = EXCLUDED.role
		RETURNING *
	`
	return json(member, { status: 201 })
}
