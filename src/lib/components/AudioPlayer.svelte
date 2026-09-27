<script lang="ts">
	import { onDestroy, onMount } from 'svelte'
	import Icon from '$lib/components/Icon.svelte'

	type AudioTrack = {
		id: number | string
		src: string
		peaks?: number[]
		duration?: number | null
	}

	type AudioMarker = {
		id: number | string
		time: number
		label?: string
	}

	type SeekRequest = {
		seconds: number
		token: number
	}

	type ToggleRequest = {
		token: number
	}

	type PlayerState = {
		currentTime: number
		duration: number
		isPlaying: boolean
		ready: boolean
	}

	let {
		track,
		media = null,
		markers = [],
		seekRequest = null,
		toggleRequest = null,
		autoplay = false,
		height = 80,
		loadingText = 'Chargement…',
		onStateChange = () => {},
		onMarkerSelect = () => {},
		onEnded = () => {}
	}: {
		track: AudioTrack
		/**
		 * `<audio>` partagé du layout. Fourni : le composant n'est qu'une vue sur ce média
		 * (WaveSurfer ne le met pas en pause quand la vue est détruite, cf. player.svelte.ts),
		 * et le `src` reste piloté par le store. Absent : le lecteur possède son propre audio.
		 */
		media?: HTMLAudioElement | null
		markers?: AudioMarker[]
		seekRequest?: SeekRequest | null
		toggleRequest?: ToggleRequest | null
		autoplay?: boolean
		height?: number
		loadingText?: string
		onStateChange?: (state: PlayerState) => void
		onMarkerSelect?: (markerId: AudioMarker['id']) => void
		onEnded?: () => void
	} = $props()

	let waveformEl = $state<HTMLElement | null>(null)
	let wavesurfer = $state<import('wavesurfer.js').default | null>(null)
	let ready = $state(false)
	let isPlaying = $state(false)
	let currentTime = $state(0)
	let duration = $state(0)
	let volume = $state(1)
	let volumeExpanded = $state(false)
	let mounted = false
	let currentTrackId = $state<AudioTrack['id'] | null>(null)
	let lastSeekToken = $state<number | null>(null)
	let lastToggleToken = $state<number | null>(null)
	let pendingAutoplay = $state(false)
	let removeMediaDurationListener: (() => void) | null = null

	function emitState() {
		onStateChange({ currentTime, duration, isPlaying, ready })
	}

	function formatTime(s: number) {
		if (!isFinite(s)) return '0:00'
		const m = Math.floor(s / 60)
		const sec = Math.floor(s % 60)
		return `${m}:${String(sec).padStart(2, '0')}`
	}

	function clearMarkers() {
		waveformEl?.querySelectorAll('.audio-marker').forEach((marker) => marker.remove())
	}

	function renderMarkers() {
		clearMarkers()
		if (!waveformEl || !duration) return

		waveformEl.style.position = 'relative'

		for (const marker of markers) {
			if (!isFinite(marker.time) || marker.time < 0 || marker.time > duration) continue

			const pct = marker.time / duration
			const el = document.createElement('button')
			el.type = 'button'
			el.className = 'audio-marker'
			el.style.left = `${pct * 100}%`
			el.title = marker.label ?? formatTime(marker.time)

			el.addEventListener('click', (event) => {
				event.preventDefault()
				event.stopPropagation()
				wavesurfer?.seekTo(pct)
				onMarkerSelect(marker.id)
			})

			waveformEl.appendChild(el)
		}
	}

	/**
	 * WaveSurfer compare les URL sous leur forme absolue. Il faut conserver cette forme
	 * pour une piste déjà chargée, sans jamais reprendre `currentSrc` s'il appartient à
	 * la piste précédente (ce qui arrive juste après un changement de `src`).
	 */
	function sourceUrl(forTrack: AudioTrack) {
		const requestedUrl = new URL(forTrack.src, document.baseURI).href
		if (!media || media.currentSrc !== requestedUrl) return requestedUrl
		return media.currentSrc
	}

	function syncDurationFromMedia(mediaElement: HTMLAudioElement | null) {
		const mediaDuration = mediaElement?.duration
		if (typeof mediaDuration !== 'number' || !Number.isFinite(mediaDuration) || mediaDuration <= 0) return

		// Les durées stockées et celles du cache de peaks sont arrondies à la seconde.
		// La durée du média est la référence dès qu'elle est disponible.
		duration = mediaDuration
		emitState()
	}

	function observeMediaDuration(mediaElement: HTMLAudioElement) {
		const sync = () => syncDurationFromMedia(mediaElement)
		mediaElement.addEventListener('loadedmetadata', sync)
		mediaElement.addEventListener('durationchange', sync)
		sync()

		return () => {
			mediaElement.removeEventListener('loadedmetadata', sync)
			mediaElement.removeEventListener('durationchange', sync)
		}
	}

	async function initPlayer() {
		if (!waveformEl || wavesurfer) return

		const WaveSurfer = (await import('wavesurfer.js')).default
		const instance = WaveSurfer.create({
			container: waveformEl,
			...(media ? { media } : {}),
			// La partie lue en orange, comme sur les plateformes d'écoute. Le canvas ne lit
			// pas les variables CSS : on les résout ici, pour rester sur les jetons du thème.
			waveColor: themeColor('--color-mid', '#9B9489'),
			progressColor: themeColor('--color-accent', '#E25E36'),
			cursorColor: themeColor('--color-ink', '#2C2B28'),
			barWidth: 2,
			barGap: 1,
			barRadius: 2,
			height,
			normalize: true,
			url: sourceUrl(track),
			...(track.peaks?.length && track.duration ? { peaks: [track.peaks], duration: track.duration } : {})
		})

		instance.on('ready', (nextDuration) => {
			duration = nextDuration
			ready = true
			emitState()
			renderMarkers()

			if (pendingAutoplay) {
				pendingAutoplay = false
				instance.play()
			}
		})

		instance.on('timeupdate', (time) => {
			currentTime = time
			emitState()
		})

		instance.on('play', () => {
			isPlaying = true
			emitState()
		})

		instance.on('pause', () => {
			isPlaying = false
			emitState()
		})

		instance.on('finish', () => {
			isPlaying = false
			emitState()
			onEnded()
		})

		wavesurfer = instance
		removeMediaDurationListener = observeMediaDuration(media ?? instance.getMediaElement())
		currentTrackId = track.id
		mounted = true

		// La vue peut se greffer sur un média déjà en cours : aucun événement `play`
		// ne sera émis, il faut donc reprendre son état tel quel.
		if (media) {
			isPlaying = !media.paused
			currentTime = media.currentTime
		}

		emitState()
	}

	function loadTrack(nextTrack: AudioTrack) {
		if (!wavesurfer) return

		ready = false
		isPlaying = false
		currentTime = 0
		duration = 0
		currentTrackId = nextTrack.id
		pendingAutoplay = autoplay
		emitState()
		clearMarkers()

		wavesurfer.load(
			sourceUrl(nextTrack),
			nextTrack.peaks?.length && nextTrack.duration ? [nextTrack.peaks] : undefined,
			nextTrack.duration ?? undefined
		)
	}

	function togglePlay() {
		wavesurfer?.playPause()
	}

	function seekStart() {
		wavesurfer?.seekTo(0)
	}

	function skipForward() {
		if (!wavesurfer || !duration) return
		wavesurfer.seekTo(Math.min(currentTime + 10, duration) / duration)
	}

	function setVolume(event: Event) {
		volume = parseFloat((event.target as HTMLInputElement).value)
		wavesurfer?.setVolume(volume)
	}

	onMount(async () => {
		await initPlayer()
	})

	onDestroy(() => {
		removeMediaDurationListener?.()
		wavesurfer?.destroy()
	})

	$effect(() => {
		emitState()
	})

	$effect(() => {
		if (!mounted || !wavesurfer || currentTrackId === track.id) return
		loadTrack(track)
	})

	$effect(() => {
		if (!ready) return
		renderMarkers()
	})

	$effect(() => {
		if (!seekRequest || !wavesurfer || !ready || !duration) return
		if (seekRequest.token === lastSeekToken) return

		lastSeekToken = seekRequest.token
		const clamped = Math.max(0, Math.min(seekRequest.seconds, duration))
		wavesurfer.seekTo(clamped / duration)
	})

	$effect(() => {
		if (!toggleRequest || !wavesurfer || !ready) return
		if (toggleRequest.token === lastToggleToken) return

		lastToggleToken = toggleRequest.token
		wavesurfer.playPause()
	})

	function themeColor(name: string, fallback: string): string {
		return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
	}
</script>

<div class="player-shell">
	<div class="waveform-wrap">
		<div bind:this={waveformEl} class="waveform"></div>
		{#if !ready}
			<div class="waveform-loading">{loadingText}</div>
		{/if}
	</div>

	<div class="player-controls">
		<span class="player-time player-controls-start"><strong>{formatTime(currentTime)}</strong></span>

		<div class="player-transport">
			<button class="player-ctrl" onclick={seekStart} title="Retour au début">
				<Icon name="skip-back" label="Retour au début" />
			</button>
			<button class="player-play" onclick={togglePlay} disabled={!ready}>
				<Icon name={isPlaying ? 'pause' : 'play'} size="1.15rem" label={isPlaying ? 'Pause' : 'Lecture'} />
			</button>
			<button class="player-ctrl" onclick={skipForward} title="+10s" disabled={!ready}>
				<Icon name="skip-forward" label="Avancer de 10 secondes" />
			</button>
		</div>

		<div class="player-controls-end">
			<span class="player-time">{formatTime(duration)}</span>
			<div class="volume-control" class:expanded={volumeExpanded}>
				<button
					class="player-ctrl volume-toggle"
					type="button"
					onclick={() => (volumeExpanded = !volumeExpanded)}
					aria-label="Régler le volume"
					aria-expanded={volumeExpanded}
				>
					<Icon name={volume === 0 ? 'volume-off' : 'volume'} />
				</button>
				<div class="volume-popover">
					<input
						type="range"
						min="0"
						max="1"
						step="0.05"
						value={volume}
						oninput={setVolume}
						class="volume-slider"
						aria-label="Volume"
					/>
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	.player-shell {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.waveform-wrap {
		position: relative;
	}

	.waveform {
		width: 100%;
		position: relative;
	}

	.waveform-loading {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.85rem;
		color: var(--color-text-muted);
		background: rgba(245, 243, 238, 0.75);
	}

	.volume-control {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.9rem;
	}

	.volume-toggle {
		display: none;
	}

	.volume-popover {
		display: flex;
		align-items: center;
	}

	.volume-slider {
		width: 72px;
		accent-color: var(--color-accent);
	}

	/* Sur mobile, le volume reste compact pour éviter d'ajouter une ligne au lecteur. */
	@media (max-width: 640px) {
		.volume-control {
			flex: 0 0 auto;
			position: relative;
		}

		.volume-toggle { display: inline-flex; }

		.volume-popover {
			display: none;
		}

		.volume-control.expanded .volume-popover {
			display: flex;
			align-items: center;
			position: absolute;
			right: 0;
			bottom: calc(100% + 0.5rem);
			width: 164px;
			height: 42px;
			padding: 0 0.65rem;
			border: 1px solid var(--color-border-light);
			border-radius: var(--radius-lg);
			background: var(--color-bg-subtle);
			box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
		}

		.volume-slider {
			width: 100%;
			height: 1.5rem;
		}
	}
</style>
