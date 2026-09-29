import type { PageServerLoad } from './$types'
import { error, redirect } from '@sveltejs/kit'
import sql from '$lib/server/db'
import { loginRedirect } from '$lib/redirect'
import { validId } from '$lib/server/score-documents'

export const load: PageServerLoad = async ({ locals, params, url }) => {
	if (!locals.user) redirect(302, loginRedirect(url))
	const id = validId(params.id)
	if (!id) error(400, 'Morceau invalide')
	const [song] = await sql`SELECT id, title FROM songs WHERE id = ${id} AND group_id = ${locals.user.current_group_id}`
	if (!song) error(404, 'Morceau introuvable')
	return { song: { id: song.id as number, title: song.title as string } }
}
