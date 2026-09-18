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

/**
 * « 83 », « 1:23 » ou « 1:02:03 » → secondes. `null` si ce n'est aucun des trois.
 *
 * Sert partout où un repère est écrit à la main plutôt que pris au lecteur : saisie à
 * l'édition d'un commentaire, `?t=` d'un lien partagé.
 */
export function parseTimecode(value: string | null | undefined): number | null {
	const trimmed = (value ?? '').trim()
	if (!trimmed) return null

	if (/^\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed)

	const parts = trimmed.split(':')
	if (parts.length < 2 || parts.length > 3) return null
	if (!parts.slice(0, -1).every((part) => /^\d+$/.test(part))) return null
	if (!/^\d+(?:\.\d+)?$/.test(parts.at(-1) as string)) return null

	const values = parts.map(Number)
	const seconds = values.at(-1) as number
	const minutes = values.at(-2) as number
	if (seconds >= 60 || minutes >= 60) return null
	return parts.length === 3
		? values[0] * 3600 + minutes * 60 + seconds
		: minutes * 60 + seconds
}

export function youtubeWatchUrl(videoId: string): string {
	return `https://www.youtube.com/watch?v=${videoId}`
}

/**
 * Repère de départ porté par un lien (`?t=90`, `?t=1m30s`, `?start=90`) → secondes.
 * Un lien collé dans un commentaire vise souvent un passage précis : le perdre
 * obligerait à rechercher à la main ce que l'auteur avait déjà pointé.
 */
export function parseYouTubeStartSeconds(input: string): number {
	let url: URL
	try {
		url = new URL(/^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`)
	} catch {
		return 0
	}

	const raw = url.searchParams.get('t') ?? url.searchParams.get('start')
	if (!raw) return 0

	if (/^\d+s?$/.test(raw)) return Math.min(parseInt(raw, 10), MAX_VIDEO_LENGTH_S)

	const parts = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/)
	if (!parts || !parts.slice(1).some(Boolean)) return 0

	const seconds =
		parseInt(parts[1] ?? '0', 10) * 3600 +
		parseInt(parts[2] ?? '0', 10) * 60 +
		parseInt(parts[3] ?? '0', 10)
	return Math.min(seconds, MAX_VIDEO_LENGTH_S)
}

/** URL d'intégration d'une vidéo, domaine sans cookie de suivi. */
export function youtubeEmbedUrl(videoId: string, startSeconds = 0, autoplay = false): string {
	const params = new URLSearchParams({ rel: '0', playsinline: '1' })
	if (startSeconds > 0) params.set('start', String(Math.floor(startSeconds)))
	if (autoplay) params.set('autoplay', '1')
	return `https://www.youtube-nocookie.com/embed/${videoId}?${params}`
}

/** Vignette de prévisualisation : une image, aucun script, aucun cookie. */
export function youtubeThumbnailUrl(videoId: string): string {
	return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
}
