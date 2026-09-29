<script lang="ts">
	import SongChartPrototype from '$lib/components/SongChartPrototype.svelte'
</script>

<svelte:head>
	<title>Feuilles de répétition</title>
</svelte:head>

<nav class="breadcrumb" aria-label="Fil d’Ariane">
	<a href="/admin">Administration</a> / <span>Feuilles de répétition</span>
</nav>

<SongChartPrototype />

<style>
	.breadcrumb { max-width: 1280px; margin: 1.25rem auto -1rem; padding: 0 1rem; color: var(--color-text-muted); font-size: var(--text-sm); }
	.breadcrumb a { color: inherit; }
</style>
