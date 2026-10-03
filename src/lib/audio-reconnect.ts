/** Reprend un flux audio interrompu sans perdre la position ni relancer une pause voulue. */
export function reconnectAudio(
	media: HTMLAudioElement,
	{ retryMs = 1000, stallMs = 8000, timeoutMs = 12000, maxRetryMs = 15000 } = {}
) {
	let wantsPlayback = false
	let recovering = false
	let resumeAt = 0
	let lastPosition = 0
	let retryDelay = retryMs
	let stallTimer: ReturnType<typeof setTimeout> | undefined
	let retryTimer: ReturnType<typeof setTimeout> | undefined
	let metadataTimer: ReturnType<typeof setTimeout> | undefined
	let pauseTimer: ReturnType<typeof setTimeout> | undefined
	let onMetadata: (() => void) | undefined

	function clearTimers() {
		clearTimeout(stallTimer)
		clearTimeout(retryTimer)
		clearTimeout(metadataTimer)
		clearTimeout(pauseTimer)
		if (onMetadata) media.removeEventListener('loadedmetadata', onMetadata)
		onMetadata = undefined
	}

	function stop() {
		wantsPlayback = false
		recovering = false
		retryDelay = retryMs
		clearTimers()
	}

	function reset() {
		stop()
		resumeAt = 0
		lastPosition = 0
	}

	function requestPlay() {
		wantsPlayback = true
	}

	function scheduleRetry(delay: number) {
		if (!wantsPlayback || media.ended || !media.src) return
		clearTimers()
		if (!recovering) {
			const time = media.currentTime
			resumeAt = Number.isFinite(time) && time > 0 ? time : lastPosition
		}
		recovering = true
		if (!navigator.onLine) return // L'événement online relancera immédiatement.
		retryTimer = setTimeout(retry, delay)
	}

	function retry() {
		if (!wantsPlayback || media.ended || !media.src) return
		if (!navigator.onLine) return
		const source = media.src
		retryDelay = Math.min(retryDelay * 2, maxRetryMs)

		onMetadata = () => {
			onMetadata = undefined
			if (!wantsPlayback || media.src !== source) return
			try {
				media.currentTime = resumeAt
			} catch {
				// Certains navigateurs n'autorisent le seek qu'après le chargement.
			}
			void media.play().catch(() => scheduleRetry(retryDelay))
		}
		media.addEventListener('loadedmetadata', onMetadata, { once: true })
		metadataTimer = setTimeout(() => scheduleRetry(retryDelay), timeoutMs)
		media.load() // Rouvre le même URL ; loadedmetadata remettra ensuite la position.
	}

	function onWaiting() {
		if (!wantsPlayback || recovering || stallTimer) return
		const at = media.currentTime
		stallTimer = setTimeout(() => {
			stallTimer = undefined
			if (!media.paused && media.currentTime === at) {
				scheduleRetry(0)
			}
		}, stallMs)
	}

	function onPlaying() {
		wantsPlayback = true
		recovering = false
		lastPosition = media.currentTime
		retryDelay = retryMs
		clearTimers()
	}

	function rememberPosition() {
		if (!recovering && Number.isFinite(media.currentTime)) lastPosition = media.currentTime
	}

	function onPlay() {
		wantsPlayback = true
	}

	function onError() {
		scheduleRetry(recovering ? retryDelay : retryMs)
	}

	function onPause() {
		// Un échec réseau peut émettre pause juste avant error : lui laisser un tour.
		pauseTimer = setTimeout(() => {
			if (media.paused && !recovering && !media.error) stop()
		}, 0)
	}

	function onOnline() {
		if (wantsPlayback && (recovering || media.error)) scheduleRetry(0)
	}

	function onVisible() {
		if (document.visibilityState === 'visible') onOnline()
	}

	media.addEventListener('play', onPlay)
	media.addEventListener('playing', onPlaying)
	media.addEventListener('timeupdate', rememberPosition)
	media.addEventListener('seeked', rememberPosition)
	media.addEventListener('waiting', onWaiting)
	media.addEventListener('stalled', onWaiting)
	media.addEventListener('error', onError)
	media.addEventListener('pause', onPause)
	media.addEventListener('ended', stop)
	window.addEventListener('online', onOnline)
	window.addEventListener('focus', onOnline)
	document.addEventListener('visibilitychange', onVisible)

	return {
		requestPlay,
		stop,
		reset,
		destroy() {
			stop()
			media.removeEventListener('play', onPlay)
			media.removeEventListener('playing', onPlaying)
			media.removeEventListener('timeupdate', rememberPosition)
			media.removeEventListener('seeked', rememberPosition)
			media.removeEventListener('waiting', onWaiting)
			media.removeEventListener('stalled', onWaiting)
			media.removeEventListener('error', onError)
			media.removeEventListener('pause', onPause)
			media.removeEventListener('ended', stop)
			window.removeEventListener('online', onOnline)
			window.removeEventListener('focus', onOnline)
			document.removeEventListener('visibilitychange', onVisible)
		}
	}
}
