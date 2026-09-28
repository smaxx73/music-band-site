import type { PageServerLoad } from './$types'
import { error } from '@sveltejs/kit'
import { isSuperadmin } from '$lib/types'

// Le prototype manipule des contenus fictifs, mais il reste volontairement dans le
// laboratoire superadmin tant que son modèle de persistance n'est pas arrêté.
export const load: PageServerLoad = ({ locals }) => {
	if (!isSuperadmin(locals.user?.role)) {
		error(403, 'Accès réservé au superadmin')
	}
}
