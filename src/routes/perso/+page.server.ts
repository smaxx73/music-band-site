import type { PageServerLoad } from './$types'
import { redirect } from '@sveltejs/kit'
import { listPersonalRecordings } from '$lib/server/personal'
import { loginRedirect } from '$lib/redirect'

// Pas de groupe actif requis : l'espace perso existe hors de tout groupe. Le groupe
// actif ne sert qu'à dire où « Publier » enverra.
export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(302, loginRedirect(url))

	const recordings = await listPersonalRecordings(locals.user.id)
	const currentGroup = locals.user.groups.find((g) => g.id === locals.user?.current_group_id) ?? null

	return {
		recordings,
		currentGroup: currentGroup ? { id: currentGroup.id, name: currentGroup.name } : null
	}
}
