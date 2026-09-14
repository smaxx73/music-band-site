import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import sql from '$lib/server/db'
import { notifyGroup } from '$lib/server/notifications'
import { resolveYouTubeVideo } from '$lib/server/youtube'
import { MAX_VIDEO_LENGTH_S } from '$lib/youtube'
import type { Recording } from '$lib/types'

/**
 * POST — crée une prise vidéo seule, sans piste audio. Une vidéo = un morceau.
 * Avec une piste audio, la prise passe par `/api/upload` (champ `youtube_url`).
 * Body : `{ session_id, song_id, video_url, duration_s? }`. La durée vient du lecteur de
 * l'écran (YouTube ne la donne pas sans clé d'API) : facultative, affichée seulement.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const groupId = locals.user.current_group_id
	const user = locals.user.display_name
	const userId = locals.user.id

	const body = await request.json().catch(() => null)
	if (!body || typeof body !== 'object') return json({ error: 'Corps de requête invalide.' }, { status: 400 })

	const { session_id: sessionId, song_id: songId, duration_s: rawDuration } = body as Record<string, unknown>
	if (typeof sessionId !== 'number' || !Number.isInteger(sessionId)) {
		return json({ error: 'session_id manquant ou invalide.' }, { status: 400 })
	}
	if (typeof songId !== 'number' || !Number.isInteger(songId)) {
		return json({ error: 'song_id manquant ou invalide.' }, { status: 400 })
	}

	const durationS =
		typeof rawDuration === 'number' && isFinite(rawDuration) && rawDuration > 0 && rawDuration <= MAX_VIDEO_LENGTH_S
			? Math.round(rawDuration)
			: null

	const video = await resolveYouTubeVideo(body.video_url, groupId)
	if (!video.ok) {
		return json({ error: video.error, ...(video.duplicate ? { duplicate: video.duplicate } : {}) }, { status: video.status })
	}

	try {
		const recording = (await sql.begin(async (tx) => {
			const [song] = await tx<{ id: number; title: string }[]>`
				SELECT id, title FROM songs
				WHERE id = ${songId} AND group_id = ${groupId} AND status != 'abandonne'
			`
			if (!song) throw Object.assign(new Error('song_not_found'), { code: 'song_not_found' })

			const [session] = await tx`SELECT id FROM sessions WHERE id = ${sessionId} AND group_id = ${groupId}`
			if (!session) throw Object.assign(new Error('session_not_found'), { code: 'session_not_found' })

			const [{ take }] = await tx`
				SELECT COALESCE(MAX(take), 0) + 1 AS take
				FROM recordings
				WHERE session_id = ${sessionId} AND song_id = ${songId}
			`
			const [rec] = await tx<Recording[]>`
				INSERT INTO recordings (
					session_id, song_id, take, youtube_video_id, youtube_title,
					duration_s, uploaded_by, uploaded_by_user_id
				)
				VALUES (
					${sessionId}, ${songId}, ${take}, ${video.videoId}, ${video.title},
					${durationS}, ${user}, ${userId}
				)
				RETURNING *
			`
			return { ...rec, song_title: song.title }
		})) as Recording & { song_title: string }

		const { song_title, ...created } = recording

		await notifyGroup({
			groupId,
			actor: { id: userId, display_name: user },
			type: 'recording',
			subject: song_title,
			excerpt: `Prise ${created.take} (vidéo)`,
			link: `/recording/${created.id}`,
			recordingId: created.id,
			sessionId: created.session_id
		})

		return json(created, { status: 201 })
	} catch (err: unknown) {
		const code = (err as { code?: string }).code
		if (code === 'song_not_found') return json({ error: 'Morceau introuvable.' }, { status: 404 })
		if (code === 'session_not_found') return json({ error: 'Session introuvable.' }, { status: 404 })

		console.error('[youtube]', err)
		return json({ error: "Erreur lors de l'ajout de la vidéo." }, { status: 500 })
	}
}
