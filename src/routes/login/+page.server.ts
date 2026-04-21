import type { Actions, PageServerLoad } from './$types'
import { fail, redirect } from '@sveltejs/kit'
import { AUTH_SECRET } from '$env/static/private'
import { signCookie, verifyPassword } from '$lib/server/auth'
import sql from '$lib/server/db'

export const load: PageServerLoad = ({ locals }) => {
	if (locals.user) redirect(302, '/')
}

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const data = await request.formData()
		const name = (data.get('name') as string | null)?.trim()
		const password = data.get('password') as string | null

		if (!name || !password) {
			return fail(400, { error: 'Champs manquants.' })
		}

		const [user] = await sql<{ name: string; password_hash: string }[]>`
			SELECT name, password_hash FROM users WHERE name = ${name} AND active = true
		`

		if (!user || !(await verifyPassword(password, user.password_hash))) {
			return fail(401, { error: 'Identifiants incorrects.' })
		}

		const signed = signCookie(name, AUTH_SECRET)
		cookies.set('band_session', signed, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			maxAge: 60 * 60 * 24 * 30 // 30 jours
		})

		redirect(302, '/')
	}
}
