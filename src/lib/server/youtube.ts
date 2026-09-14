/**
 * Informations publiques d'une vidéo YouTube, via oEmbed : ni clé d'API, ni quota.
 *
 * oEmbed répond 401 quand la vidéo est privée ou que son propriétaire interdit
 * l'intégration, 404 quand elle n'existe pas : dans les deux cas le lecteur intégré
 * ne la jouera pas, autant refuser la prise tout de suite.
 */

import sql from './db'
import { parseYouTubeVideoId } from '$lib/youtube'

export type YouTubeVideoInfo =
	| { ok: true; title: string | null }
	| { ok: false; error: string }

export async function fetchYouTubeVideoInfo(videoId: string): Promise<YouTubeVideoInfo> {
	const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(
		`https://www.youtube.com/watch?v=${videoId}`
	)}`

	let res: Response
	try {
		res = await fetch(url, { signal: AbortSignal.timeout(5000) })
	} catch (err) {
		// YouTube injoignable depuis le serveur : on ne bloque pas l'ajout pour autant,
		// le lecteur dira lui-même si la vidéo ne se lit pas.
		console.warn('[youtube] oEmbed injoignable', err)
		return { ok: true, title: null }
	}

	if (res.status === 401 || res.status === 403) {
		return { ok: false, error: "Cette vidéo est privée ou son intégration est désactivée : elle ne pourra pas être lue ici." }
	}
	if (res.status === 404 || res.status === 400) {
		return { ok: false, error: 'Vidéo YouTube introuvable.' }
	}
	if (!res.ok) return { ok: true, title: null }

	const body = (await res.json().catch(() => null)) as { title?: unknown } | null
	const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 200) : null
	return { ok: true, title: title || null }
}

export type ResolvedYouTubeVideo =
	| { ok: true; videoId: string; title: string | null }
	| { ok: false; status: number; error: string; duplicate?: unknown }

/**
 * Lien saisi → vidéo prête à rattacher à une prise : identifiant reconnu, vidéo lisible,
 * et pas déjà présente dans le groupe (même rôle que `file_hash` pour l'audio).
 * Partagé par `/api/youtube` (vidéo seule) et `/api/upload` (vidéo + piste audio).
 */
export async function resolveYouTubeVideo(rawUrl: unknown, groupId: number): Promise<ResolvedYouTubeVideo> {
	const videoId = typeof rawUrl === 'string' ? parseYouTubeVideoId(rawUrl) : null
	if (!videoId) return { ok: false, status: 400, error: 'Lien YouTube non reconnu.' }

	const [duplicate] = await sql`
		SELECT r.id, r.take, ses.date AS session_date, s.title AS song_title
		FROM recordings r
		JOIN sessions ses ON ses.id = r.session_id
		JOIN songs s ON s.id = r.song_id
		WHERE r.youtube_video_id = ${videoId} AND ses.group_id = ${groupId}
	`
	if (duplicate) return { ok: false, status: 409, error: 'doublon', duplicate }

	const info = await fetchYouTubeVideoInfo(videoId)
	if (!info.ok) return { ok: false, status: 400, error: info.error }

	return { ok: true, videoId, title: info.title }
}
