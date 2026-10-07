import type { PageServerLoad } from './$types'
import { error, redirect } from '@sveltejs/kit'
import sql from '$lib/server/db'
import { loginRedirect } from '$lib/redirect'
import { retargetActiveGroup } from '$lib/server/group-scope'
import { canDeleteScoreDocument, validId, type ScoreBlock } from '$lib/server/score-documents'

export const load: PageServerLoad = async ({ locals, params, url, cookies, isDataRequest }) => {
	if (!locals.user) redirect(302, loginRedirect(url))
	const id = validId(params.id)
	if (!id) error(400, 'Morceau invalide')
	const [song] = await sql`
		SELECT id, title, lyrics, music_notes, reference_duration_s FROM songs
		WHERE id = ${id} AND group_id = ${locals.user.current_group_id}
	`
	if (!song) {
		await retargetActiveGroup(locals.user, { cookies, url, isDataRequest }, 'song', id)
		error(404, 'Morceau introuvable')
	}

	// La feuille arrive avec la page : elle s'ouvre en lecture, sans attendre un second
	// aller-retour pour afficher ce qu'on vient lire.
	const [row] = await sql`
		SELECT d.id, d.user_id, d.title, d.manifest, d.contents, d.updated_at, u.display_name AS updated_by
		FROM score_documents d LEFT JOIN users u ON u.id = d.updated_by_user_id
		WHERE d.song_id = ${id}
	`
	const originals = row
		? await sql`SELECT block_id, file_name, format, warning FROM score_originals WHERE document_id = ${row.id}`
		: []
	const sheet = row
		? {
				id: row.id as number,
				title: row.title as string,
				manifest: row.manifest as ScoreBlock[],
				contents: row.contents as Record<string, string>,
				updated_at: row.updated_at as Date,
				updated_by: row.updated_by as string | null,
				can_delete: canDeleteScoreDocument(locals.user, {
					song_id: id,
					user_id: row.user_id as number | null,
					group_id: locals.user.current_group_id
				}),
				originals: originals as unknown as {
					block_id: number
					file_name: string
					format: 'musicxml' | 'mxl'
					warning: string | null
				}[]
			}
		: null

	return {
		song: {
			id: song.id as number,
			title: song.title as string,
			lyrics: song.lyrics as string | null,
			music_notes: song.music_notes as string | null,
			reference_duration_s: song.reference_duration_s as number | null
		},
		sheet
	}
}
