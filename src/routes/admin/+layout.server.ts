import type { LayoutServerLoad } from './$types'
import { error } from '@sveltejs/kit'

export const load: LayoutServerLoad = ({ locals }) => {
	if (locals.user?.role !== 'admin') {
		error(403, 'Accès réservé aux administrateurs')
	}
}
