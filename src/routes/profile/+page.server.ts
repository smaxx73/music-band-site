import type { PageServerLoad, Actions } from './$types'
import { error, fail, redirect } from '@sveltejs/kit'
import sql from '$lib/server/db'
import { hashPassword, signCookie, verifyPassword } from '$lib/server/auth'
import { authSecret } from '$lib/server/config'

const DISPLAY_NAME_FORMATS = [
	'nickname',
	'first_name',
	'first_name_last_initial',
	'first_name_last_name'
] as const

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(302, '/login')

	const [account] = await sql<{ created_at: Date }[]>`
		SELECT created_at FROM users WHERE id = ${locals.user.id}
	`

	return { created_at: account?.created_at ?? null }
}

export const actions: Actions = {
	updateProfile: async ({ request, locals, cookies }) => {
		if (!locals.user) error(401, 'Non autorisé')

		const data = await request.formData()
		const nickname = (data.get('nickname') as string | null)?.trim()
		const firstName = (data.get('first_name') as string | null)?.trim() || null
		const lastName = (data.get('last_name') as string | null)?.trim() || null
		const displayNameFormat = data.get('display_name_format') as (typeof DISPLAY_NAME_FORMATS)[number] | null

		if (!nickname || nickname.length > 50)
			return fail(400, { action: 'updateProfile', error: 'Le pseudo est obligatoire et ne peut pas dépasser 50 caractères.' })
		if ((firstName && firstName.length > 100) || (lastName && lastName.length > 100))
			return fail(400, { action: 'updateProfile', error: 'Le nom et le prénom ne peuvent pas dépasser 100 caractères.' })
		if (!displayNameFormat || !DISPLAY_NAME_FORMATS.includes(displayNameFormat))
			return fail(400, { action: 'updateProfile', error: 'Format de nom affiché invalide.' })

		try {
			await sql`
				UPDATE users
				SET nickname = ${nickname}, first_name = ${firstName}, last_name = ${lastName},
					display_name_format = ${displayNameFormat}
				WHERE id = ${locals.user.id}
			`
		} catch (err) {
			if (isUniqueViolation(err))
				return fail(409, { action: 'updateProfile', error: 'Ce pseudo est déjà utilisé.' })
			throw err
		}
		// Les anciennes sessions signaient le pseudo. On les convertit ici vers un identifiant stable,
		// afin qu'un futur changement de pseudo ne déconnecte pas l'utilisateur.
		cookies.set('band_session', signCookie(`user:${locals.user.id}`, authSecret()), {
			path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 30
		})

		return { action: 'updateProfile', success: true }
	},

	changePassword: async ({ request, locals }) => {
		if (!locals.user) error(401, 'Non autorisé')

		const data = await request.formData()
		const currentPassword = data.get('current_password') as string | null
		const newPassword = data.get('new_password') as string | null
		const confirmPassword = data.get('confirm_password') as string | null

		if (!currentPassword) return fail(400, { action: 'changePassword', error: 'Mot de passe actuel requis.' })
		if (!newPassword || newPassword.length < 6)
			return fail(400, { action: 'changePassword', error: 'Le nouveau mot de passe doit faire au moins 6 caractères.' })
		if (newPassword !== confirmPassword)
			return fail(400, { action: 'changePassword', error: 'Les deux mots de passe ne correspondent pas.' })

		const [row] = await sql<{ password_hash: string }[]>`
			SELECT password_hash FROM users WHERE id = ${locals.user.id}
		`
		if (!row || !(await verifyPassword(currentPassword, row.password_hash))) {
			return fail(400, { action: 'changePassword', error: 'Mot de passe actuel incorrect.' })
		}

		const hash = await hashPassword(newPassword)
		await sql`UPDATE users SET password_hash = ${hash} WHERE id = ${locals.user.id}`

		return { action: 'changePassword', success: true }
	}
}

function isUniqueViolation(err: unknown): boolean {
	return typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === '23505'
}
