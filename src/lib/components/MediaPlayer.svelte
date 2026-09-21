<script lang="ts">
	import AudioPlayer from '$lib/components/AudioPlayer.svelte'
	import YouTubePlayer from '$lib/components/YouTubePlayer.svelte'
	import Icon from '$lib/components/Icon.svelte'
	import { player as sharedPlayer } from '$lib/player.svelte'

	/**
	 * Lecteur d'un enregistrement perso, sur sa page comme sur celle d'une publication :
	 * piste audio, vidéo YouTube, ou les deux en onglets — comme une prise. L'audio a son
	 * propre `<audio>` : un enregistrement perso n'entre pas dans la barre du bas, qui
	 * ne joue que des prises du groupe. Un seul lecteur à la fois : lancer celui-ci met
	 * la barre du bas en pause.
	 */
	type Marker = { id: number | string; time: number; label?: string }
	type PlayerState = { currentTime: number; duration: number; isPlaying: boolean; ready: boolean }

	let {
		trackId,
		audioSrc,
		peaks = [],
		duration = null,
		videoId = null,
		markers = [],
		seekRequest = null,
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
		onStateChange?: (state: PlayerState) => void
		onMarkerSelect?: (markerId: Marker['id']) => void
	} = $props()

	// $derived inscriptible : l'audio d'abord quand il existe, et retour à l'audio en
	// changeant d'enregistrement.
	let view = $derived<'audio' | 'video'>(audioSrc ? 'audio' : 'video')
	const track = $derived(audioSrc ? { id: trackId, src: audioSrc, peaks, duration } : null)

	function handleAudioState(state: PlayerState) {
		if (state.isPlaying && sharedPlayer.isPlaying) sharedPlayer.pause()
		onStateChange(state)
	}
</script>

{#if audioSrc && videoId}
	<div class="view-tabs" role="tablist" aria-label="Lecteur">
		<button role="tab" class="view-tab" class:active={view === 'audio'} aria-selected={view === 'audio'} onclick={() => (view = 'audio')}>
			<Icon name="waveform" size="0.9rem" /> Audio
		</button>
		<button role="tab" class="view-tab" class:active={view === 'video'} aria-selected={view === 'video'} onclick={() => (view = 'video')}>
			<Icon name="video" size="0.9rem" /> Vidéo
		</button>
	</div>
{/if}

{#if view === 'video' && videoId}
	<YouTubePlayer {videoId} {markers} {seekRequest} {onStateChange} {onMarkerSelect} />
{:else if track}
	<!-- Changer d'onglet détruit ce lecteur, et son `<audio>` avec lui : l'audio s'arrête. -->
	<AudioPlayer {track} {markers} {seekRequest} onStateChange={handleAudioState} {onMarkerSelect} />
{/if}

<style>
	.view-tabs { display: flex; gap: 0.25rem; margin-bottom: 0.6rem; }
	.view-tab {
		display: inline-flex; align-items: center; gap: 0.35rem;
		padding: 0.3rem 0.7rem; border: 1px solid var(--color-border-light); border-radius: 999px;
		background: var(--color-bg); color: var(--color-text-secondary); font: inherit; font-size: var(--text-sm); cursor: pointer;
	}
	.view-tab.active { border-color: var(--color-primary); color: var(--color-text); font-weight: 600; }
</style>
