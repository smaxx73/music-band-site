<script lang="ts">
	import type { PageData } from './$types'
	import SongChartPrototype from '$lib/components/SongChartPrototype.svelte'
	let { data }: { data: PageData } = $props()
</script>

<svelte:head><title>Feuille de répétition — {data.song.title}</title></svelte:head>
{#key data.song.id}
	<SongChartPrototype
		songId={data.song.id}
		songTitle={data.song.title}
		songLyrics={data.song.lyrics}
		songMusicNotes={data.song.music_notes}
		initialSheet={data.sheet}
	>
		{#snippet breadcrumb()}
			<nav class="breadcrumb" aria-label="Fil d’Ariane"><a href="/songs">Morceaux</a> / <a href="/songs/{data.song.id}">{data.song.title}</a> / <span>Feuille de répétition</span></nav>
		{/snippet}
	</SongChartPrototype>
{/key}
