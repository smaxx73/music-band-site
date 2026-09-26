<script lang="ts">
	import { player, type PlayerTrack } from '$lib/player.svelte'
	import RoundPlayButton from '$lib/components/RoundPlayButton.svelte'

	let { tracks, label }: { tracks: PlayerTrack[]; label: string } = $props()

	// Le bouton suit la série qu'il a lancée : pause tant qu'une de ses prises joue,
	// reprise si l'une d'elles est en pause, sinon on repart de la première.
	const current = $derived(tracks.some((t) => t.recordingId === player.track?.recordingId))
	const playing = $derived(current && player.isPlaying)

	function onclick() {
		if (playing) player.pause()
		else if (current) player.play()
		else player.playAll(tracks)
	}
</script>

{#if tracks.length > 0}
	<RoundPlayButton {playing} {label} {onclick} />
{/if}
