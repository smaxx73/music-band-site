import type { PageServerLoad } from './$types'
import { redirect } from '@sveltejs/kit'
import { listPersonalRecordings, personalAudioBytes } from '$lib/server/personal'
import { listRecentImports } from '$lib/server/imports'
import { loginRedirect } from '$lib/redirect'

// Pas de groupe actif requis : l'espace perso existe hors de tout groupe. Le groupe
// actif ne sert qu'à dire où « Publier » enverra.
export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(302, loginRedirect(url))

	const [recordings, audioBytes, imports] = await Promise.all([
		listPersonalRecordings(locals.user.id),
		personalAudioBytes(locals.user.id),
		// Découpes destinées à l'espace, encore reprenables : `null` = hors de tout groupe.
		listRecentImports(locals.user.id, null)
	])
	const currentGroup = locals.user.groups.find((g) => g.id === locals.user?.current_group_id) ?? null

	return {
		recordings,
		audioBytes,
		imports,
		currentGroup: currentGroup ? { id: currentGroup.id, name: currentGroup.name } : null
	}
}
