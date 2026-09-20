<script lang="ts">
	import { player } from '$lib/player.svelte'
	import AddToPlaylistButton from '$lib/components/AddToPlaylistButton.svelte'

	let {
		recordingId,
		songId,
		songTitle,
		take,
		sessionDate,
		durationS,
		hasAudio
	}: {
		recordingId: number
		songId: number
		songTitle: string
		take: number
		sessionDate: string
		durationS: number | null
		hasAudio: boolean
	} = $props()

	function playInMiniPlayer() {
		player.load(
			{
				recordingId,
				songId,
				songTitle,
				take,
				sessionDate,
				durationS
			},
			true
		)
	}
</script>

{#if hasAudio}
	<div class="playback-actions">
		<button
			class="btn btn-secondary btn-sm mini-player-button"
			onclick={playInMiniPlayer}
			title="Écouter dans le mini-lecteur persistant"
			aria-label="Écouter dans le mini-lecteur persistant"
		>▶</button>
		<a href="/recording/{recordingId}" class="btn btn-secondary btn-sm" title="Ouvrir le lecteur complet">
			Lecteur complet
		</a>
		<AddToPlaylistButton {recordingId} {hasAudio} label="+ Playlist" />
	</div>
{:else}
	<!-- Une vidéo sans piste audio se regarde uniquement sur sa page dédiée. -->
	<a href="/recording/{recordingId}" class="btn btn-secondary btn-sm" title="Regarder la vidéo">🎬 Voir</a>
{/if}

<style>
	.playback-actions { display: flex; gap: 0.35rem; align-items: center; }
	.mini-player-button { min-width: 2rem; padding-inline: 0.45rem; }
</style>
