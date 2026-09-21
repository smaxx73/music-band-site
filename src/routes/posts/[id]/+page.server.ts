import type { PageServerLoad } from './$types'
import { error, redirect } from '@sveltejs/kit'
import sql from '$lib/server/db'
import { getPost, postReactionSummary } from '$lib/server/posts'
import { loadPersonalPeaks } from '$lib/server/personal'
import { commentsWithReactions } from '$lib/server/comments'
import { retargetActiveGroup } from '$lib/server/group-scope'
import { loginRedirect } from '$lib/redirect'
import { postPlayable } from '$lib/types'

export const load: PageServerLoad = async ({ locals, params, cookies, url, isDataRequest }) => {
	if (!locals.user) redirect(302, loginRedirect(url))
	if (!locals.user.current_group_id) error(403, 'Aucun groupe actif')

	const id = parseInt(params.id)
	if (isNaN(id)) error(400, 'ID invalide')

	const post = await getPost(id, locals.user.current_group_id)
	if (!post) {
		// Un lien reçu peut viser un autre groupe de l'utilisateur : y basculer plutôt
		// que d'opposer un « introuvable » qui ne dit pas quoi faire.
		await retargetActiveGroup(locals.user, { cookies, url, isDataRequest }, 'post', id)
		error(404, 'Publication introuvable')
	}

	const [comments, reactions, peaks, groupMembers, songInReferential] = await Promise.all([
		commentsWithReactions({ kind: 'post', id, anchorable: postPlayable(post) }, locals.user.id),
		postReactionSummary(id, locals.user.id),
		post.personal_recording_id !== null && post.recording_has_audio
			? loadPersonalPeaks(post.personal_recording_id)
			: Promise.resolve({ peaks: [] as number[], duration: null }),
		// Le pseudo est l'identifiant stable utilisé dans la syntaxe @pseudo ; le nom
		// affiché aide à reconnaître les membres qui ont choisi un autre affichage.
		sql<{ id: number; nickname: string; display_name: string }[]>`
			SELECT u.id, u.nickname, u.display_name
			FROM user_groups ug
			JOIN users u ON u.id = ug.user_id
			WHERE ug.group_id = ${locals.user.current_group_id} AND u.active = true
			ORDER BY u.display_name, u.nickname
		`,
		// Une suggestion dont le titre est déjà au référentiel, sans y avoir été ajoutée
		// d'ici : l'écran y renvoie au lieu de proposer un ajout voué au 409.
		post.type === 'song_suggestion' && post.song_id === null && post.song_title
			? sql<{ id: number }[]>`
				SELECT id FROM songs
				WHERE group_id = ${locals.user.current_group_id} AND lower(title) = lower(${post.song_title})
			`.then((rows) => rows[0]?.id ?? null)
			: Promise.resolve(null)
	])

	return {
		post,
		comments,
		reactions,
		peaks: peaks.peaks,
		peaksDuration: peaks.duration,
		groupMembers,
		existingSongId: songInReferential
	}
}
