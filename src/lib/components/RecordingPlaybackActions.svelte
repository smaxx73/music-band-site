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

	// La prise qui joue déjà se met en pause au lieu de repartir du début.
	const playing = $derived(player.isPlaying && player.track?.recordingId === recordingId)

	function togglePlayback() {
		player.toggleTrack({ recordingId, songId, songTitle, take, sessionDate, durationS })
	}
</script>

<!-- Écouter ici, et rien d'autre. Ouvrir le lecteur complet et ajouter à une playlist
     sont voisins sur la ligne au-dessus de 640 px, et passent dans le menu ⋮ en dessous —
     c'est `RecordingRow` qui arbitre. À la souris, la ligne le remplace par le ▶ de sa
     colonne de tête ; au doigt, cette commande ne disparaît jamais. -->
{#if hasAudio}
	<button
		class="btn btn-secondary btn-sm btn-icon"
		onclick={togglePlayback}
		title={playing ? 'Mettre en pause' : 'Écouter dans le mini-lecteur persistant'}
		aria-label={playing ? 'Mettre en pause' : 'Écouter dans le mini-lecteur persistant'}
	>
		<Icon name={playing ? 'pause' : 'play'} />
	</button>
{:else}
	<!-- Une vidéo sans piste audio se regarde uniquement sur sa page dédiée. -->
	<a href="/recording/{recordingId}" class="btn btn-secondary btn-sm" title="Regarder la vidéo">
		<Icon name="video" /> Voir
	</a>
{/if}
