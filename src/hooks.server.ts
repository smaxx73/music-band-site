import type { Handle } from '@sveltejs/kit'
import { verifyCookie } from '$lib/server/auth'
import { AUTH_SECRET } from '$env/static/private'
import sql from '$lib/server/db'

export const handle: Handle = async ({ event, resolve }) => {
	const signed = event.cookies.get('band_session')
	if (signed) {
		const name = verifyCookie(signed, AUTH_SECRET)
		if (name) {
			const [user] = await sql<{ id: number; name: string; role: 'admin' | 'user' }[]>`
				SELECT id, name, role FROM users WHERE name = ${name} AND active = true
			`
			if (user) {
				const groups = await sql<{ id: number; name: string; role: 'admin' | 'member' }[]>`
					SELECT g.id, g.name, ug.role
					FROM user_groups ug
					JOIN groups g ON g.id = ug.group_id
					WHERE ug.user_id = ${user.id}
					ORDER BY g.name
				`

				const groupCookie = event.cookies.get('band_group')
				let current_group_id: number | null = null

				if (groupCookie) {
					const parsed = parseInt(groupCookie)
					if (!isNaN(parsed) && groups.some((g) => g.id === parsed)) {
						current_group_id = parsed
					}
				}

				if (!current_group_id && groups.length > 0) {
					current_group_id = groups[0].id
					// Persister le groupe actif en cookie
					event.cookies.set('band_group', String(current_group_id), {
						path: '/',
						httpOnly: true,
						sameSite: 'lax',
						maxAge: 60 * 60 * 24 * 365
					})
				}

				event.locals.user = { ...user, current_group_id, groups }
			} else {
				event.locals.user = null
			}
		} else {
			event.locals.user = null
		}
	} else {
		event.locals.user = null
	}
	return resolve(event)
}
