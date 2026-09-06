import type { LayoutServerLoad } from './$types'
import { error } from '@sveltejs/kit'
import { isAdmin } from '$lib/types'

export const load: LayoutServerLoad = ({ locals }) => {
	if (!isAdmin(locals.user?.role)) {
		error(403, 'Accès réservé aux administrateurs')
	}
}
