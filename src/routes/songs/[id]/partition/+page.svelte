<script lang="ts">
	import type { PageData } from './$types'
	import SongChartPrototype from '$lib/components/SongChartPrototype.svelte'
	let { data }: { data: PageData } = $props()
</script>

<svelte:head><title>Partition — {data.song.title}</title></svelte:head>
<nav class="breadcrumb" aria-label="Fil d’Ariane"><a href="/songs">Morceaux</a> / <a href="/songs/{data.song.id}">{data.song.title}</a> / <span>Partition</span></nav>
<SongChartPrototype songId={data.song.id} songTitle={data.song.title} />

<style>
	.breadcrumb { max-width: 1400px; margin: 1.25rem auto -1rem; padding: 0 1rem; color: var(--color-text-muted); font-size: var(--text-sm); }
	.breadcrumb a { color: inherit; }
</style>
