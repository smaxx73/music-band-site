import type { PageServerLoad } from './$types'
import { error, redirect } from '@sveltejs/kit'
import { getPersonalRecording, loadPersonalPeaks } from '$lib/server/personal'
import { loginRedirect } from '$lib/redirect'
import { activeShareCount } from '$lib/server/share-links'

// L'enregistrement d'un autre répond 404, jamais 403 : rien ne doit confirmer qu'il
// existe. Pas de bascule de groupe non plus — l'espace perso n'en a pas.
export const load: PageServerLoad = async ({ locals, params, url }) => {
	if (!locals.user) redirect(302, loginRedirect(url))

	const id = parseInt(params.id)
	if (isNaN(id)) error(400, 'ID invalide')

	const recording = await getPersonalRecording(id, locals.user.id)
	if (!recording) error(404, 'Enregistrement introuvable')

	const [peaks, shareCount] = recording.file_path
		? await Promise.all([loadPersonalPeaks(id), activeShareCount({ kind: 'personal', id })])
		: [{ peaks: [] as number[], duration: null }, 0]
	const currentGroup = locals.user.groups.find((g) => g.id === locals.user?.current_group_id) ?? null

	return {
		recording,
		peaks: peaks.peaks,
		peaksDuration: peaks.duration,
		shareCount,
		currentGroup: currentGroup ? { id: currentGroup.id, name: currentGroup.name } : null
	}
}
