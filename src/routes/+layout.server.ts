import type { LayoutServerLoad } from './$types'
import { redirect } from '@sveltejs/kit'

export const load: LayoutServerLoad = ({ locals, url }) => {
	if (!locals.user && url.pathname !== '/login') {
		redirect(302, '/login')
	}

	return { user: locals.user }
}
