import type { Handle } from '@sveltejs/kit'
import { verifyCookie } from '$lib/server/auth'
import { AUTH_SECRET } from '$env/static/private'
import sql from '$lib/server/db'

export const handle: Handle = async ({ event, resolve }) => {
	const signed = event.cookies.get('band_session')
	if (signed) {
		const name = verifyCookie(signed, AUTH_SECRET)
		if (name) {
			const [user] = await sql<{ name: string; role: 'admin' | 'user' }[]>`
				SELECT name, role FROM users WHERE name = ${name} AND active = true
			`
			event.locals.user = user ?? null
		} else {
			event.locals.user = null
		}
	} else {
		event.locals.user = null
	}
	return resolve(event)
}
