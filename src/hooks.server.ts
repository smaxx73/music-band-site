import type { Handle } from '@sveltejs/kit'
import { verifyCookie } from '$lib/server/auth'
import { AUTH_SECRET } from '$env/static/private'

export const handle: Handle = async ({ event, resolve }) => {
	const signed = event.cookies.get('band_session')
	event.locals.user = signed ? verifyCookie(signed, AUTH_SECRET) : null
	return resolve(event)
}
