import type { PageServerLoad } from './$types'
import { error, redirect } from '@sveltejs/kit'
import sql from '$lib/server/db'
import { analyzeImport, importPeaks, loadImport } from '$lib/server/imports'
import { SPLIT_DEFAULTS } from '$lib/types'

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) redirect(302, '/login')
	if (!locals.user.current_group_id) redirect(302, '/upload')

	const groupId = locals.user.current_group_id
	const audioImport = await loadImport(locals.user.id, groupId, params.id)
	if (!audioImport) {
		error(404, "Cet import n'existe plus : il a déjà été découpé ou a expiré.")
	}

	const [songs, sessions] = await Promise.all([
		sql<{ id: number; title: string }[]>`
			SELECT id, title FROM songs
			WHERE group_id = ${groupId} AND status != 'abandonne'
			ORDER BY title
		`,
		sql<{ id: number; date: string; location: string | null }[]>`
			SELECT id, date, location FROM sessions
			WHERE group_id = ${groupId}
			ORDER BY date DESC
		`
	])

	// Une analyse qui échoue ne doit pas rendre la page inaccessible : l'écran
	// affiche alors le message et propose d'abandonner l'import.
	try {
		const [analysis, peaks] = await Promise.all([
			analyzeImport(audioImport.id, SPLIT_DEFAULTS),
			importPeaks(audioImport.id)
		])
		return { audioImport, songs, sessions, peaks, ...analysis, analysisError: null }
	} catch (err) {
		console.error('[decoupe] analyse', err)
		return {
			audioImport,
			songs,
			sessions,
			peaks: [] as number[],
			params: SPLIT_DEFAULTS,
			segments: [],
			duration_s: audioImport.duration_s ?? 0,
			analysisError: "Le fichier n'a pas pu être analysé."
		}
	}
}
