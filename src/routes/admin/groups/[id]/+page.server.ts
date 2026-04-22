import type { PageServerLoad, Actions } from './$types'
import { error, fail } from '@sveltejs/kit'
import sql from '$lib/server/db'

export const load: PageServerLoad = async ({ params }) => {
	const id = parseInt(params.id)
	if (isNaN(id)) error(400, 'ID invalide')

	const [group] = await sql`SELECT * FROM groups WHERE id = ${id}`
	if (!group) error(404, 'Groupe introuvable')

	const members = await sql`
		SELECT u.id, u.name, u.role AS global_role, ug.role AS group_role, ug.joined_at
		FROM user_groups ug
		JOIN users u ON u.id = ug.user_id
		WHERE ug.group_id = ${id}
		ORDER BY u.name
	`

	const allUsers = await sql`
		SELECT id, name, role FROM users WHERE active = true ORDER BY name
	`

	return { group, members, allUsers }
}

export const actions: Actions = {
	rename: async ({ request, locals, params }) => {
		if (locals.user?.role !== 'admin') error(403, 'Accès réservé aux administrateurs')

		const id = parseInt(params.id)
		const data = await request.formData()
		const name = (data.get('name') as string | null)?.trim()

		if (!name) return fail(400, { action: 'rename', error: 'Le nom est obligatoire.' })

		try {
			const [group] = await sql`
				UPDATE groups SET name = ${name} WHERE id = ${id} RETURNING id
			`
			if (!group) return fail(404, { action: 'rename', error: 'Groupe introuvable.' })
		} catch (err) {
			if (isUniqueViolation(err))
				return fail(409, { action: 'rename', error: 'Ce nom existe déjà.' })
			throw err
		}
	},

	addMember: async ({ request, locals, params }) => {
		if (locals.user?.role !== 'admin') error(403, 'Accès réservé aux administrateurs')

		const id = parseInt(params.id)
		const data = await request.formData()
		const userId = parseInt(data.get('user_id') as string)
		const role = (data.get('role') as string) ?? 'member'

		if (isNaN(userId)) return fail(400, { action: 'addMember', error: 'Utilisateur invalide.' })
		if (role !== 'admin' && role !== 'member')
			return fail(400, { action: 'addMember', error: 'Rôle invalide.' })

		await sql`
			INSERT INTO user_groups (user_id, group_id, role)
			VALUES (${userId}, ${id}, ${role})
			ON CONFLICT (user_id, group_id) DO UPDATE SET role = EXCLUDED.role
		`
	},

	updateRole: async ({ request, locals, params }) => {
		if (locals.user?.role !== 'admin') error(403, 'Accès réservé aux administrateurs')

		const id = parseInt(params.id)
		const data = await request.formData()
		const userId = parseInt(data.get('user_id') as string)
		const role = data.get('role') as string

		if (isNaN(userId)) return fail(400, { action: 'updateRole', error: 'ID invalide.' })
		if (role !== 'admin' && role !== 'member')
			return fail(400, { action: 'updateRole', error: 'Rôle invalide.' })

		const [member] = await sql`
			UPDATE user_groups SET role = ${role}
			WHERE user_id = ${userId} AND group_id = ${id}
			RETURNING user_id
		`
		if (!member) return fail(404, { action: 'updateRole', error: 'Membre introuvable.' })
	},

	removeMember: async ({ request, locals, params }) => {
		if (locals.user?.role !== 'admin') error(403, 'Accès réservé aux administrateurs')

		const id = parseInt(params.id)
		const data = await request.formData()
		const userId = parseInt(data.get('user_id') as string)

		if (isNaN(userId)) return fail(400, { action: 'removeMember', error: 'ID invalide.' })

		const [deleted] = await sql`
			DELETE FROM user_groups WHERE user_id = ${userId} AND group_id = ${id}
			RETURNING user_id
		`
		if (!deleted) return fail(404, { action: 'removeMember', error: 'Membre introuvable.' })
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
