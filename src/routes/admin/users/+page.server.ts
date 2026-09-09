import type { PageServerLoad, Actions } from './$types'
import { error, fail } from '@sveltejs/kit'
import sql from '$lib/server/db'
import { hashPassword } from '$lib/server/auth'
import { isAdmin, isSuperadmin, type UserRole } from '$lib/types'

export const load: PageServerLoad = async () => {
	const users = await sql`
		SELECT id, nickname, first_name, last_name, display_name, role, active, created_at
		FROM users
		ORDER BY nickname
	`
	return { users }
}

const VALID_ROLES: UserRole[] = ['user', 'admin', 'superadmin']

// Seul un superadmin peut attribuer ou toucher un compte admin/superadmin.
// Un admin classique ne peut gérer que les comptes 'user'.
function canAssignRole(actorRole: UserRole, role: UserRole): boolean {
	return role === 'user' || isSuperadmin(actorRole)
}

export const actions: Actions = {
	create: async ({ request, locals }) => {
		if (!locals.user || !isAdmin(locals.user.role)) error(403, 'Accès réservé aux administrateurs')

		const data = await request.formData()
		const nickname = (data.get('nickname') as string | null)?.trim()
		const password = (data.get('password') as string | null)
		const role = ((data.get('role') as string | null) ?? 'user') as UserRole

		if (!nickname || nickname.length > 50)
			return fail(400, { action: 'create', error: 'Le pseudo est obligatoire et ne peut pas dépasser 50 caractères.' })
		if (!password || password.length < 6)
			return fail(400, { action: 'create', error: 'Le mot de passe doit faire au moins 6 caractères.' })
		if (!VALID_ROLES.includes(role))
			return fail(400, { action: 'create', error: 'Rôle invalide.' })
		if (!canAssignRole(locals.user.role, role))
			return fail(403, { action: 'create', error: 'Seul un super-admin peut créer un compte administrateur.' })

		const hash = await hashPassword(password)

		try {
			await sql`
				INSERT INTO users (nickname, password_hash, role)
				VALUES (${nickname}, ${hash}, ${role})
			`
		} catch (err) {
			if (isUniqueViolation(err))
				return fail(409, { action: 'create', error: 'Ce pseudo est déjà utilisé.' })
			throw err
		}
	},

	update: async ({ request, locals }) => {
		if (!locals.user || !isAdmin(locals.user.role)) error(403, 'Accès réservé aux administrateurs')

		const data = await request.formData()
		const id = parseInt(data.get('id') as string)
		const role = data.get('role') as UserRole | null
		const active = data.get('active') === 'true'

		if (isNaN(id)) return fail(400, { action: 'update', id, error: 'ID invalide.' })
		if (!role || !VALID_ROLES.includes(role))
			return fail(400, { action: 'update', id, error: 'Rôle invalide.' })

		const target = await getUser(id)
		if (!target) return fail(404, { action: 'update', id, error: 'Utilisateur introuvable.' })

		// Un admin classique ne peut ni toucher un compte admin/superadmin existant,
		// ni promouvoir quelqu'un vers ces rôles.
		if (!canAssignRole(locals.user.role, target.role) || !canAssignRole(locals.user.role, role)) {
			return fail(403, { action: 'update', id, error: 'Seul un super-admin peut gérer les comptes administrateur.' })
		}

		// Empêcher un admin/superadmin de se désactiver ou de se rétrograder lui-même
		if (locals.user.id === id && (!active || !isAdmin(role))) {
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
		if (!locals.user || !isAdmin(locals.user.role)) error(403, 'Accès réservé aux administrateurs')

		const data = await request.formData()
		const id = parseInt(data.get('id') as string)
		const password = data.get('password') as string | null

		if (isNaN(id)) return fail(400, { action: 'resetPassword', id, error: 'ID invalide.' })
		if (!password || password.length < 6)
			return fail(400, { action: 'resetPassword', id, error: 'Le mot de passe doit faire au moins 6 caractères.' })

		const target = await getUser(id)
		if (!target) return fail(404, { action: 'resetPassword', id, error: 'Utilisateur introuvable.' })
		if (!canAssignRole(locals.user.role, target.role))
			return fail(403, { action: 'resetPassword', id, error: 'Seul un super-admin peut gérer les comptes administrateur.' })

		const hash = await hashPassword(password)
		const [user] = await sql`
			UPDATE users SET password_hash = ${hash}
			WHERE id = ${id}
			RETURNING id
		`
		if (!user) return fail(404, { action: 'resetPassword', id, error: 'Utilisateur introuvable.' })
	},

	delete: async ({ request, locals }) => {
		if (!locals.user || !isAdmin(locals.user.role)) error(403, 'Accès réservé aux administrateurs')

		const data = await request.formData()
		const id = parseInt(data.get('id') as string)
		if (isNaN(id)) return fail(400, { action: 'delete', error: 'ID invalide.' })

		const target = await getUser(id)
		if (!target) return fail(404, { action: 'delete', id, error: 'Utilisateur introuvable.' })
		if (id === locals.user.id)
			return fail(400, { action: 'delete', id, error: 'Vous ne pouvez pas supprimer votre propre compte.' })
		if (!canAssignRole(locals.user.role, target.role))
			return fail(403, { action: 'delete', id, error: 'Seul un super-admin peut gérer les comptes administrateur.' })

		const [deleted] = await sql`DELETE FROM users WHERE id = ${id} RETURNING id`
		if (!deleted) return fail(404, { action: 'delete', id, error: 'Utilisateur introuvable.' })
	}
}

async function getUser(id: number): Promise<{ role: UserRole } | null> {
	const [u] = await sql<{ role: UserRole }[]>`SELECT role FROM users WHERE id = ${id}`
	return u ?? null
}

function isUniqueViolation(err: unknown): boolean {
	return (
		typeof err === 'object' &&
		err !== null &&
		'code' in err &&
		(err as { code: string }).code === '23505'
	)
}
