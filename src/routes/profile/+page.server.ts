import type { PageServerLoad, Actions } from './$types'
import { error, fail, redirect } from '@sveltejs/kit'
import sql from '$lib/server/db'
import { hashPassword, verifyPassword } from '$lib/server/auth'

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(302, '/login')

	const [account] = await sql<{ created_at: Date }[]>`
		SELECT created_at FROM users WHERE id = ${locals.user.id}
	`

	return { created_at: account?.created_at ?? null }
}

// Le nom sert d'identifiant de connexion et est référencé tel quel (author/uploaded_by/created_by)
// dans sessions, recordings, comments, calendar_events — pas d'auto-renommage ici, uniquement le mot de passe.
export const actions: Actions = {
	changePassword: async ({ request, locals }) => {
		if (!locals.user) error(401, 'Non autorisé')

		const data = await request.formData()
		const currentPassword = data.get('current_password') as string | null
		const newPassword = data.get('new_password') as string | null
		const confirmPassword = data.get('confirm_password') as string | null

		if (!currentPassword) return fail(400, { error: 'Mot de passe actuel requis.' })
		if (!newPassword || newPassword.length < 6)
			return fail(400, { error: 'Le nouveau mot de passe doit faire au moins 6 caractères.' })
		if (newPassword !== confirmPassword)
			return fail(400, { error: 'Les deux mots de passe ne correspondent pas.' })

		const [row] = await sql<{ password_hash: string }[]>`
			SELECT password_hash FROM users WHERE id = ${locals.user.id}
		`
		if (!row || !(await verifyPassword(currentPassword, row.password_hash))) {
			return fail(400, { error: 'Mot de passe actuel incorrect.' })
		}

		const hash = await hashPassword(newPassword)
		await sql`UPDATE users SET password_hash = ${hash} WHERE id = ${locals.user.id}`

		return { success: true }
	}
}
