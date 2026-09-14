/**
 * Prises YouTube : outils partagés entre l'écran et l'API.
 *
 * Une prise YouTube est une vidéo entière qui contient un seul morceau. On ne garde jamais
 * l'URL saisie : seul l'identifiant, validé, arrive dans l'iframe du lecteur.
 */

/** Garde-fou sur la durée remontée par le lecteur : aucun morceau ne dure 12 heures. */
export const MAX_VIDEO_LENGTH_S = 12 * 3600

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/

const YOUTUBE_HOSTS = ['youtube.com', 'youtube-nocookie.com']

function isYouTubeHost(host: string) {
	return YOUTUBE_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`))
}

/**
 * Extrait l'identifiant d'une vidéo depuis toutes les formes de lien courantes
 * (`watch?v=`, `youtu.be/`, `live/`, `shorts/`, `embed/`), ou un identifiant nu.
 */
export function parseYouTubeVideoId(input: string): string | null {
	const raw = input.trim()
	if (VIDEO_ID.test(raw)) return raw

	let url: URL
	try {
		url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
	} catch {
		return null
	}

	const host = url.hostname.toLowerCase()
	let candidate: string | null = null

	if (host === 'youtu.be') {
		candidate = url.pathname.split('/')[1] ?? null
	} else if (isYouTubeHost(host)) {
		const [first, second] = url.pathname.split('/').filter(Boolean)
		if (first === 'watch') candidate = url.searchParams.get('v')
		else if (['live', 'shorts', 'embed', 'v'].includes(first ?? '')) candidate = second ?? null
	}

	return candidate && VIDEO_ID.test(candidate) ? candidate : null
}

/** Secondes → « 1:23 » ou « 1:02:03 ». */
export function formatTimecode(seconds: number): string {
	if (!isFinite(seconds)) return '0:00'
	const total = Math.floor(Math.max(0, seconds))
	const h = Math.floor(total / 3600)
	const m = Math.floor((total % 3600) / 60)
	const s = total % 60
	return h > 0
		? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
		: `${m}:${String(s).padStart(2, '0')}`
}

export function youtubeWatchUrl(videoId: string): string {
	return `https://www.youtube.com/watch?v=${videoId}`
}
