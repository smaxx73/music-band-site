/**
 * Chargement de l'API IFrame de YouTube, côté navigateur uniquement.
 *
 * Le script est chargé à la demande, une seule fois, et seulement sur les pages qui
 * affichent une prise YouTube. Les types ci-dessous ne couvrent que ce que l'application
 * utilise : pas de dépendance @types pour une poignée de méthodes.
 */

export const YT_STATE = {
	UNSTARTED: -1,
	ENDED: 0,
	PLAYING: 1,
	PAUSED: 2,
	BUFFERING: 3,
	CUED: 5
} as const

export type YTPlayer = {
	playVideo(): void
	pauseVideo(): void
	seekTo(seconds: number, allowSeekAhead: boolean): void
	getCurrentTime(): number
	getDuration(): number
	getPlayerState(): number
	getIframe(): HTMLIFrameElement
	destroy(): void
}

type YTPlayerOptions = {
	videoId: string
	host?: string
	width?: string | number
	height?: string | number
	playerVars?: Record<string, string | number>
	events?: {
		onReady?: (event: { target: YTPlayer }) => void
		onStateChange?: (event: { data: number; target: YTPlayer }) => void
		onError?: (event: { data: number }) => void
	}
}

type YTNamespace = {
	Player: new (element: HTMLElement, options: YTPlayerOptions) => YTPlayer
}

declare global {
	interface Window {
		YT?: YTNamespace
		onYouTubeIframeAPIReady?: () => void
	}
}

let apiPromise: Promise<YTNamespace> | null = null

export function loadYouTubeApi(): Promise<YTNamespace> {
	if (window.YT?.Player) return Promise.resolve(window.YT)
	if (apiPromise) return apiPromise

	apiPromise = new Promise<YTNamespace>((resolve, reject) => {
		const previous = window.onYouTubeIframeAPIReady
		window.onYouTubeIframeAPIReady = () => {
			previous?.()
			if (window.YT) resolve(window.YT)
		}

		const script = document.createElement('script')
		script.src = 'https://www.youtube.com/iframe_api'
		script.async = true
		script.onerror = () => {
			// Permet de retenter au prochain montage (bloqueur de contenu levé, réseau revenu).
			apiPromise = null
			reject(new Error('youtube_api_unavailable'))
		}
		document.head.appendChild(script)
	})

	return apiPromise
}

/** Codes d'erreur du lecteur → message lisible. */
export function youtubeErrorMessage(code: number): string {
	if (code === 100) return 'Vidéo introuvable : elle a été supprimée ou rendue privée sur YouTube.'
	if (code === 101 || code === 150) return "Le propriétaire de la vidéo n'autorise pas sa lecture intégrée."
	return 'La vidéo ne peut pas être lue.'
}
