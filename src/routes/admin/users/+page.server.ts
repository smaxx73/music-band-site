import type { PageServerLoad, Actions } from './$types'
import { error, fail } from '@sveltejs/kit'
import sql from '$lib/server/db'
import { hashPassword } from '$lib/server/auth'

export const load: PageServerLoad = async () => {
	const users = await sql`
		SELECT id, name, role, active, created_at
		FROM users
		ORDER BY name
	`
	return { users }
}

const VALID_ROLES = ['admin', 'user']

export const actions: Actions = {
	create: async ({ request, locals }) => {
		if (locals.user?.role !== 'admin') error(403, 'Accès réservé aux administrateurs')

		const data = await request.formData()
		const name = (data.get('name') as string | null)?.trim()
		const password = (data.get('password') as string | null)
		const role = (data.get('role') as string | null) ?? 'user'

		if (!name) return fail(400, { action: 'create', error: 'Le nom est obligatoire.' })
		if (!password || password.length < 6)
			return fail(400, { action: 'create', error: 'Le mot de passe doit faire au moins 6 caractères.' })
		if (!VALID_ROLES.includes(role))
			return fail(400, { action: 'create', error: 'Rôle invalide.' })

		const hash = await hashPassword(password)

		try {
			await sql`
				INSERT INTO users (name, password_hash, role)
				VALUES (${name}, ${hash}, ${role})
			`
		} catch (err) {
			if (isUniqueViolation(err))
				return fail(409, { action: 'create', error: 'Ce nom est déjà utilisé.' })
			throw err
		}
	},

	update: async ({ request, locals }) => {
		if (locals.user?.role !== 'admin') error(403, 'Accès réservé aux administrateurs')

		const data = await request.formData()
		const id = parseInt(data.get('id') as string)
		const role = data.get('role') as string | null
		const active = data.get('active') === 'true'

		if (isNaN(id)) return fail(400, { action: 'update', id, error: 'ID invalide.' })
		if (!role || !VALID_ROLES.includes(role))
			return fail(400, { action: 'update', id, error: 'Rôle invalide.' })

		// Empêcher un admin de se désactiver lui-même
		if (locals.user.name === (await getUserName(id)) && (!active || role !== 'admin')) {
			return fail(400, { action: 'update', id, error: 'Vous ne pouvez pas modifier votre propre compte admin.' })
		}

		const [user] = await sql`
			UPDATE users SET role = ${role}, active = ${active}
			WHERE id = ${id}
			RETURNING id
		`
		if (!user) return fail(404, { action: 'update', id, error: 'Utilisateur introuvable.' })
	},

	resetPassword: async ({ request, locals }) => {
		if (locals.user?.role !== 'admin') error(403, 'Accès réservé aux administrateurs')

		const data = await request.formData()
		const id = parseInt(data.get('id') as string)
		const password = data.get('password') as string | null

		if (isNaN(id)) return fail(400, { action: 'resetPassword', id, error: 'ID invalide.' })
		if (!password || password.length < 6)
			return fail(400, { action: 'resetPassword', id, error: 'Le mot de passe doit faire au moins 6 caractères.' })

		const hash = await hashPassword(password)
		const [user] = await sql`
			UPDATE users SET password_hash = ${hash}
			WHERE id = ${id}
			RETURNING id
		`
		if (!user) return fail(404, { action: 'resetPassword', id, error: 'Utilisateur introuvable.' })
	},

	delete: async ({ request, locals }) => {
		if (locals.user?.role !== 'admin') error(403, 'Accès réservé aux administrateurs')

		const data = await request.formData()
		const id = parseInt(data.get('id') as string)
		if (isNaN(id)) return fail(400, { action: 'delete', error: 'ID invalide.' })

		const name = await getUserName(id)
		if (name === locals.user.name)
			return fail(400, { action: 'delete', id, error: 'Vous ne pouvez pas supprimer votre propre compte.' })

		const [deleted] = await sql`DELETE FROM users WHERE id = ${id} RETURNING id`
		if (!deleted) return fail(404, { action: 'delete', id, error: 'Utilisateur introuvable.' })
	}
}

async function getUserName(id: number): Promise<string | null> {
	const [u] = await sql<{ name: string }[]>`SELECT name FROM users WHERE id = ${id}`
	return u?.name ?? null
}

function isUniqueViolation(err: unknown): boolean {
	return (
		typeof err === 'object' &&
		err !== null &&
		'code' in err &&
		(err as { code: string }).code === '23505'
	)
}
