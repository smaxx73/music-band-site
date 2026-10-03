<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte'
	import { player as sharedPlayer } from '$lib/player.svelte'
	import { formatTimecode } from '$lib/youtube'
	import Icon from '$lib/components/Icon.svelte'
	import { loadYouTubeApi, youtubeErrorMessage, YT_STATE, type YTPlayer } from '$lib/youtube-player'

	type Marker = { id: number | string; time: number; label?: string; draft?: boolean }
	type PlayerState = { currentTime: number; duration: number; isPlaying: boolean; ready: boolean }

	let {
		videoId,
		markers = [],
		seekRequest = null,
		onStateChange = () => {},
		onMarkerSelect = () => {}
	}: {
		videoId: string
		markers?: Marker[]
		seekRequest?: { seconds: number; token: number } | null
		onStateChange?: (state: PlayerState) => void
		onMarkerSelect?: (markerId: Marker['id']) => void
	} = $props()

	let hostEl = $state<HTMLElement | null>(null)
	let yt: YTPlayer | null = null
	let ready = $state(false)
	let isPlaying = $state(false)
	let currentTime = $state(0)
	let duration = $state(0)
	let errorMessage = $state<string | null>(null)
	let lastSeekToken: number | null = null
	let poll: ReturnType<typeof setInterval> | null = null

	$effect(() => {
		onStateChange({ currentTime, duration, isPlaying, ready })
	})

	// L'API IFrame n'émet aucun événement de progression : on relit la position.
	function tick() {
		if (!yt || !ready) return
		currentTime = yt.getCurrentTime()
		if (!duration) duration = yt.getDuration()
	}

	onMount(async () => {
		let api
		try {
			api = await loadYouTubeApi()
		} catch {
			errorMessage = 'Impossible de charger le lecteur YouTube (réseau ou bloqueur de contenu).'
			return
		}
		if (!hostEl) return

		// YouTube remplace l'élément reçu par son iframe : on lui en donne un que Svelte ne gère pas.
		const target = document.createElement('div')
		hostEl.appendChild(target)

		yt = new api.Player(target, {
			videoId,
			// Pas de cookie de suivi posé tant que la vidéo n'est pas lue.
			host: 'https://www.youtube-nocookie.com',
			width: '100%',
			height: '100%',
			playerVars: { controls: 0, disablekb: 1, playsinline: 1, rel: 0, fs: 1 },
			events: {
				onReady: () => {
					ready = true
					duration = yt?.getDuration() ?? 0
				},
				onStateChange: (event) => {
					isPlaying = event.data === YT_STATE.PLAYING
					// Un seul lecteur à la fois dans l'application.
					if (isPlaying) sharedPlayer.pause()
					tick()
				},
				onError: (event) => {
					errorMessage = youtubeErrorMessage(event.data)
				}
			}
		})

		poll = setInterval(tick, 250)
	})

	onDestroy(() => {
		if (poll) clearInterval(poll)
		yt?.destroy()
		yt = null
	})

	// Et réciproquement : relancer la barre du bas met la vidéo en pause. Seul le passage
	// à la lecture compte : juste après `sharedPlayer.pause()`, son état vaut encore
	// « en lecture » le temps que l'événement arrive, et la vidéo se couperait elle-même.
	let sharedWasPlaying = false
	$effect(() => {
		const playing = sharedPlayer.isPlaying
		if (playing && !sharedWasPlaying) untrack(() => { if (isPlaying) yt?.pauseVideo() })
		sharedWasPlaying = playing
	})

	$effect(() => {
		if (!seekRequest || !ready) return
		if (seekRequest.token === lastSeekToken) return
		lastSeekToken = seekRequest.token
		seek(seekRequest.seconds)
	})

	function seek(seconds: number) {
		if (!yt || !ready) return
		const target = Math.max(0, duration ? Math.min(seconds, duration) : seconds)
		yt.seekTo(target, true)
		currentTime = target
	}

	function togglePlay() {
		if (!yt || !ready) return
		if (isPlaying) yt.pauseVideo()
		else yt.playVideo()
	}

	function fullscreen() {
		yt?.getIframe().requestFullscreen?.().catch(() => {})
	}
</script>

<div class="yt-shell">
	<div class="yt-frame" bind:this={hostEl}>
		{#if errorMessage}
			<div class="yt-overlay error">{errorMessage}</div>
		{:else if !ready}
			<div class="yt-overlay">Chargement de la vidéo…</div>
		{/if}
	</div>

	<div class="progress">
		<div class="marker-track">
			{#if duration > 0}
				{#each markers as marker (marker.id)}
					{#if marker.draft && marker.time >= 0 && marker.time <= duration}
						<span
							class="yt-marker draft"
							style="left: {(marker.time / duration) * 100}%"
							title={marker.label ?? formatTimecode(marker.time)}
						></span>
					{:else if marker.time >= 0 && marker.time <= duration}
						<button
							type="button"
							class="yt-marker"
							style="left: {(marker.time / duration) * 100}%"
							title={marker.label ?? formatTimecode(marker.time)}
							onclick={() => {
								seek(marker.time)
								onMarkerSelect(marker.id)
							}}
						></button>
					{/if}
				{/each}
			{/if}
		</div>
		<input
			type="range"
			min="0"
			max={duration || 1}
			step="1"
			value={currentTime}
			disabled={!ready || !duration}
			oninput={(e) => seek(parseFloat((e.currentTarget as HTMLInputElement).value))}
			aria-label="Position dans la vidéo"
		/>
	</div>

	<div class="player-controls">
		<span class="player-time player-controls-start"><strong>{formatTimecode(currentTime)}</strong></span>

		<div class="player-transport">
			<button class="player-ctrl" onclick={() => seek(0)} title="Retour au début" disabled={!ready}>
				<Icon name="skip-back" label="Retour au début" />
			</button>
			<button class="player-ctrl" onclick={() => seek(currentTime - 10)} title="−10 s" disabled={!ready}>−10</button>
			<button class="player-play" onclick={togglePlay} disabled={!ready}>
				<Icon name={isPlaying ? 'pause' : 'play'} size="1.15rem" label={isPlaying ? 'Pause' : 'Lecture'} />
			</button>
			<button class="player-ctrl" onclick={() => seek(currentTime + 10)} title="+10 s" disabled={!ready}>+10</button>
		</div>

		<div class="player-controls-end">
			<span class="player-time">{formatTimecode(duration)}</span>
			<button class="player-ctrl" onclick={fullscreen} title="Plein écran" disabled={!ready}>
				<Icon name="fullscreen" label="Plein écran" />
			</button>
		</div>
	</div>
</div>

<style>
	.yt-shell { display: flex; flex-direction: column; gap: 0.6rem; }

	.yt-frame {
		position: relative;
		width: 100%;
		max-width: 100%;
		aspect-ratio: 16 / 9;
		background: #111;
		border-radius: var(--radius-lg);
		overflow: hidden;
	}

	/* L'iframe est créée par l'API YouTube, hors du scope des styles du composant. */
	.yt-frame :global(iframe) { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }

	.yt-overlay {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		text-align: center;
		color: #ddd;
		font-size: var(--text-sm);
		z-index: 1;
	}

	.yt-overlay.error { background: #111; color: #fca5a5; }

	.progress { position: relative; padding-top: 0.55rem; }

	.progress input[type='range'] { width: 100%; margin: 0; accent-color: var(--color-accent); }

	.marker-track { position: absolute; top: 0; left: 0; right: 0; height: 0.55rem; }

	.yt-marker {
		position: absolute;
		top: 0;
		width: 0.6rem;
		height: 0.6rem;
		margin-left: -0.3rem;
		padding: 0;
		border: none;
		border-radius: 50%;
		background: var(--color-accent);
		cursor: pointer;
	}

	/* Le commentaire en cours d'écriture : cerclé, pas plein — il n'existe pas encore. */
	.yt-marker.draft {
		background: var(--color-bg);
		box-shadow: inset 0 0 0 2px var(--color-accent);
		pointer-events: none;
	}
</style>
