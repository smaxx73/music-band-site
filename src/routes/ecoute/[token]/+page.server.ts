import type { PageServerLoad } from './$types'
import { error } from '@sveltejs/kit'
import { loadPeaks } from '$lib/server/peaks'
import { loadPersonalPeaks } from '$lib/server/personal'
import { isPreviewBot, markShareAccessed, resolveShareToken } from '$lib/server/share-links'
import { DEFAULT_SHARE_IMAGE, groupLogoThumbnailUrl } from '$lib/types'

// Page publique : ouverte sans compte (voir PUBLIC_PATHS dans +layout.server.ts). Elle ne
// reçoit que ce que `resolveShareToken` accepte d'exposer — jamais l'id de la prise, ni
// commentaires, ni note, ni participants.
export const load: PageServerLoad = async ({ params, setHeaders, isDataRequest, request, url }) => {
	setHeaders({
		// Le jeton est dans l'URL : un lien sortant le transmettrait dans le Referer.
		'Referrer-Policy': 'no-referrer',
		// Un lien partagé peut finir sur une page publique ; il n'a pas à finir indexé.
		'X-Robots-Tag': 'noindex, nofollow',
		// Révoqué, le lien doit cesser de répondre tout de suite, pas après un cache.
		'Cache-Control': 'private, no-store'
	})

	const shared = await resolveShareToken(params.token)
	// Même réponse pour un lien expiré, révoqué ou inventé : aucun ne doit se reconnaître.
	if (!shared) error(404, "Ce lien d'écoute n'existe pas, a expiré ou a été retiré.")

	// Une ouverture, pas chaque requête de données de la même visite ; ni le robot qui
	// fabrique l'aperçu du lien dans une messagerie.
	if (!isDataRequest && !isPreviewBot(request.headers.get('user-agent'))) {
		await markShareAccessed(shared.linkId)
	}

	// Image d'aperçu du lien (WhatsApp, Messenger…) : la miniature du logo du groupe, sinon
	// celle de BandStash. Absolue, comme Open Graph l'exige.
	const previewImage = new URL(
		shared.group_id !== null && shared.logo_version !== null
			? groupLogoThumbnailUrl(shared.group_id, shared.logo_version)
			: DEFAULT_SHARE_IMAGE,
		url.origin
	).href

	const peaks = shared.target.kind === 'recording'
		? await loadPeaks(shared.target.id, shared.filePath)
		: await loadPersonalPeaks(shared.target.id)

	return {
		title: shared.title,
		group_name: shared.group_name,
		session_date: shared.session_date,
		take: shared.take,
		created_at: shared.created_at,
		duration_s: shared.duration_s ?? peaks.duration,
		expires_at: shared.expires_at,
		peaks: peaks.peaks,
		preview_image: previewImage,
		page_url: `${url.origin}${url.pathname}`
	}
}
