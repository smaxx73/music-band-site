import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import sql from '$lib/server/db'

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (locals.user.role !== 'admin') return json({ error: 'Réservé aux administrateurs.' }, { status: 403 })

	const groupId = parseInt(params.id)
	const userId = parseInt(params.userId)
	if (isNaN(groupId) || isNaN(userId)) return json({ error: 'ID invalide.' }, { status: 400 })

	const body = await request.json()
	const role: unknown = body.role

	if (role !== 'admin' && role !== 'member') {
		return json({ error: 'Rôle invalide (admin | member).' }, { status: 400 })
	}

	const [member] = await sql`
		UPDATE user_groups SET role = ${role}
		WHERE user_id = ${userId} AND group_id = ${groupId}
		RETURNING *
	`
	if (!member) return json({ error: 'Membre introuvable.' }, { status: 404 })
	return json(member)
}

export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (locals.user.role !== 'admin') return json({ error: 'Réservé aux administrateurs.' }, { status: 403 })

	const groupId = parseInt(params.id)
	const userId = parseInt(params.userId)
	if (isNaN(groupId) || isNaN(userId)) return json({ error: 'ID invalide.' }, { status: 400 })

	const [deleted] = await sql`
		DELETE FROM user_groups
		WHERE user_id = ${userId} AND group_id = ${groupId}
		RETURNING user_id
	`
	if (!deleted) return json({ error: 'Membre introuvable.' }, { status: 404 })
	return json({ success: true })
}
