import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import sql from '$lib/server/db'
import { getPersonalRecording, normalizeNotes, normalizeTitle } from '$lib/server/personal'
import { fetchYouTubeVideoInfo } from '$lib/server/youtube'
import { MAX_VIDEO_LENGTH_S, parseYouTubeVideoId } from '$lib/youtube'

/**
 * POST — entrée vidéo seule dans l'espace perso : `{ title?, notes?, video_url, duration_s? }`.
 * Sans titre saisi, celui de la vidéo (oEmbed) en tient lieu.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })

	const body = await request.json().catch(() => null)
	if (!body || typeof body !== 'object') return json({ error: 'Corps de requête invalide.' }, { status: 400 })
	const { title: rawTitle, notes, video_url: videoUrl, duration_s: rawDuration } = body as Record<string, unknown>

	const videoId = typeof videoUrl === 'string' ? parseYouTubeVideoId(videoUrl) : null
	if (!videoId) return json({ error: 'Lien YouTube non reconnu.' }, { status: 400 })

	const info = await fetchYouTubeVideoInfo(videoId)
	if (!info.ok) return json({ error: info.error }, { status: 400 })

	const title = normalizeTitle(rawTitle, info.title ?? 'Vidéo YouTube')
	const durationS =
		typeof rawDuration === 'number' && isFinite(rawDuration) && rawDuration > 0 && rawDuration <= MAX_VIDEO_LENGTH_S
			? Math.round(rawDuration)
			: null

	const [created] = await sql<{ id: number }[]>`
		INSERT INTO personal_recordings (user_id, title, notes, youtube_video_id, youtube_title, duration_s)
		VALUES (${locals.user.id}, ${title}, ${normalizeNotes(notes)}, ${videoId}, ${info.title}, ${durationS})
		RETURNING id
	`
	return json(await getPersonalRecording(created.id, locals.user.id), { status: 201 })
}
