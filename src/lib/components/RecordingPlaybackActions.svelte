<script lang="ts">
	import { player } from '$lib/player.svelte'
	import Icon from '$lib/components/Icon.svelte'

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

<!-- Écouter ici, et rien d'autre. Ouvrir le lecteur complet et ajouter à une playlist
     sont voisins sur la ligne au-dessus de 640 px, et passent dans le menu ⋮ en dessous —
     c'est `RecordingRow` qui arbitre, cette commande-ci ne disparaît jamais. -->
{#if hasAudio}
	<button
		class="btn btn-secondary btn-sm btn-icon"
		onclick={playInMiniPlayer}
		title="Écouter dans le mini-lecteur persistant"
		aria-label="Écouter dans le mini-lecteur persistant"
	>
		<Icon name="play" />
	</button>
{:else}
	<!-- Une vidéo sans piste audio se regarde uniquement sur sa page dédiée. -->
	<a href="/recording/{recordingId}" class="btn btn-secondary btn-sm" title="Regarder la vidéo">
		<Icon name="video" /> Voir
	</a>
{/if}
