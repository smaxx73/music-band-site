<script lang="ts">
	import AudioPlayer from '$lib/components/AudioPlayer.svelte'
	import YouTubePlayer from '$lib/components/YouTubePlayer.svelte'
	import Icon from '$lib/components/Icon.svelte'
	import { untrack } from 'svelte'
	import { player as sharedPlayer, type PersonalTrack } from '$lib/player.svelte'

	/**
	 * Lecteur d'un enregistrement perso, sur sa page comme sur celle d'une publication :
	 * piste audio, vidéo YouTube, ou les deux en onglets — comme une prise. L'audio a son
	 * propre `<audio>`, sauf si `shared` est fourni : la page de l'enregistrement perso
	 * greffe alors sa forme d'onde sur le média de la barre du bas, comme la page d'une
	 * prise, et la lecture survit à la navigation. Publication et lien d'écoute public
	 * gardent leur `<audio>` : un seul lecteur à la fois, lancer celui-ci met la barre du
	 * bas en pause.
	 */
	type Marker = { id: number | string; time: number; label?: string; draft?: boolean }
	type PlayerState = { currentTime: number; duration: number; isPlaying: boolean; ready: boolean }

	let {
		trackId,
		audioSrc,
		peaks = [],
		duration = null,
		videoId = null,
		markers = [],
		seekRequest = null,
		shared = null,
		onStateChange = () => {},
		onMarkerSelect = () => {}
	}: {
		trackId: string
		/** NULL = vidéo seule. */
		audioSrc: string | null
		peaks?: number[]
		duration?: number | null
		videoId?: string | null
		markers?: Marker[]
		seekRequest?: { seconds: number; token: number } | null
		/** Piste à jouer dans la barre du bas plutôt que dans un `<audio>` propre. */
		shared?: PersonalTrack | null
		onStateChange?: (state: PlayerState) => void
		onMarkerSelect?: (markerId: Marker['id']) => void
	} = $props()

	// $derived inscriptible : l'audio d'abord quand il existe, et retour à l'audio en
	// changeant d'enregistrement.
	let view = $derived<'audio' | 'video'>(audioSrc ? 'audio' : 'video')
	const track = $derived(audioSrc ? { id: trackId, src: audioSrc, peaks, duration } : null)

	const sharedMatches = $derived(!!shared && sharedPlayer.isPersonal(shared.recordingId))

	// Libre, la barre du bas peut être initialisée par cette page sans lancer la lecture.
	$effect(() => {
		const s = shared
		if (!s) return
		untrack(() => {
			if (!sharedPlayer.track) sharedPlayer.load(s)
		})
	})

	// La forme d'onde ne masque la barre du bas que lorsqu'elle pilote la même piste.
	$effect(() => {
		if (!shared || !sharedMatches) return
		sharedPlayer.attachView()
		return () => sharedPlayer.detachView()
	})

	function playShared(at: number) {
		if (!shared) return
		sharedPlayer.load(shared, true)
		if (at > 0) sharedPlayer.seek(at)
	}

	function selectView(next: 'audio' | 'video') {
		if (next === 'video' && sharedMatches) sharedPlayer.pause()
		view = next
	}

	function handleAudioState(state: PlayerState) {
		if (!shared && state.isPlaying && sharedPlayer.isPlaying) sharedPlayer.pause()
		onStateChange(state)
	}
</script>

{#if audioSrc && videoId}
	<div class="view-tabs" role="tablist" aria-label="Lecteur">
		<button role="tab" class="view-tab" class:active={view === 'audio'} aria-selected={view === 'audio'} onclick={() => selectView('audio')}>
			<Icon name="waveform" size="0.9rem" /> Audio
		</button>
		<button role="tab" class="view-tab" class:active={view === 'video'} aria-selected={view === 'video'} onclick={() => selectView('video')}>
			<Icon name="video" size="0.9rem" /> Vidéo
		</button>
	</div>
{/if}

{#if view === 'video' && videoId}
	<YouTubePlayer {videoId} {markers} {seekRequest} {onStateChange} {onMarkerSelect} />
{:else if track}
	<!-- Changer d'onglet détruit ce lecteur, et son `<audio>` avec lui : l'audio s'arrête. -->
	{#key sharedMatches}
		<AudioPlayer
			{track}
			media={sharedMatches ? sharedPlayer.media : null}
			{markers}
			{seekRequest}
			onPlayRequest={shared && !sharedMatches ? playShared : null}
			onStateChange={handleAudioState}
			{onMarkerSelect}
		/>
	{/key}
{/if}

<style>
	.view-tabs { display: flex; gap: 0.25rem; margin-bottom: 0.6rem; }
	.view-tab {
		display: inline-flex; align-items: center; gap: 0.35rem;
		padding: 0.3rem 0.7rem; border: 1px solid var(--color-border-light); border-radius: var(--radius-pill);
		background: var(--color-bg); color: var(--color-text-secondary); font: inherit; font-size: var(--text-sm); cursor: pointer;
	}
	.view-tab.active { border-color: var(--color-primary); color: var(--color-text); font-weight: 600; }
</style>
