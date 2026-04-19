<script lang="ts">
	import { onDestroy, onMount } from 'svelte'

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
	let mounted = false
	let currentTrackId = $state<AudioTrack['id'] | null>(null)
	let lastSeekToken = $state<number | null>(null)
	let lastToggleToken = $state<number | null>(null)
	let pendingAutoplay = $state(false)

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

	async function initPlayer() {
		if (!waveformEl || wavesurfer) return

		const WaveSurfer = (await import('wavesurfer.js')).default
		const instance = WaveSurfer.create({
			container: waveformEl,
			waveColor: '#6b7280',
			progressColor: '#1a1a1a',
			cursorColor: '#1a1a1a',
			barWidth: 2,
			barGap: 1,
			barRadius: 2,
			height,
			normalize: true,
			url: track.src,
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
		currentTrackId = track.id
		mounted = true
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
			nextTrack.src,
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
</script>

<div class="player-shell">
	<div class="waveform-wrap">
		<div bind:this={waveformEl} class="waveform"></div>
		{#if !ready}
			<div class="waveform-loading">{loadingText}</div>
		{/if}
	</div>

	<div class="controls">
		<div class="controls-left">
			<button class="ctrl-btn" onclick={seekStart} title="Retour au début">⏮</button>
			<button class="ctrl-btn play-btn" onclick={togglePlay} disabled={!ready}>
				{isPlaying ? '⏸' : '▶'}
			</button>
			<button class="ctrl-btn" onclick={skipForward} title="+10s" disabled={!ready}>⏭</button>
		</div>

		<div class="time">
			<span class="current">{formatTime(currentTime)}</span>
			<span class="sep">/</span>
			<span>{formatTime(duration)}</span>
		</div>

		<label class="volume-label">
			🔊
			<input
				type="range"
				min="0"
				max="1"
				step="0.05"
				value={volume}
				oninput={setVolume}
				class="volume-slider"
			/>
		</label>
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
		color: #888;
		background: linear-gradient(to bottom, rgba(255, 255, 255, 0.72), rgba(255, 255, 255, 0.72));
	}

	.controls {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.controls-left {
		display: flex;
		gap: 0.4rem;
	}

	.ctrl-btn {
		background: none;
		border: 1px solid #ddd;
		border-radius: 6px;
		width: 34px;
		height: 34px;
		font-size: 0.95rem;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.ctrl-btn:hover:not(:disabled) {
		background: #f0f0f0;
	}

	.ctrl-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.play-btn {
		width: 42px;
		height: 42px;
		font-size: 1.1rem;
		background: #1a1a1a;
		color: white;
		border-color: #1a1a1a;
	}

	.play-btn:hover:not(:disabled) {
		background: #333;
	}

	.time {
		font-size: 0.875rem;
		font-variant-numeric: tabular-nums;
		color: #444;
		display: flex;
		gap: 0.2rem;
	}

	.current {
		font-weight: 700;
	}

	.sep {
		color: #bbb;
	}

	.volume-label {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.9rem;
	}

	.volume-slider {
		width: 72px;
		accent-color: #1a1a1a;
	}

	:global(.audio-marker) {
		position: absolute;
		top: 0;
		width: 2px;
		height: 100%;
		padding: 0;
		border: 0;
		background: #e67e22;
		cursor: pointer;
		z-index: 10;
		transform: translateX(-50%);
	}

	:global(.audio-marker::after) {
		content: '';
		position: absolute;
		top: -1px;
		left: 50%;
		transform: translateX(-50%);
		width: 8px;
		height: 8px;
		background: #e67e22;
		border-radius: 50%;
	}
 </style>
