<script lang="ts">
	import SongCover from '$lib/components/SongCover.svelte'
	import Icon from '$lib/components/Icon.svelte'

	// Une playlist se montre par ce qu'elle contient : la mosaïque des pochettes de ses
	// quatre premiers morceaux, comme sur les plateformes de streaming. En deçà de quatre
	// morceaux distincts, une mosaïque aurait des trous : la première pochette suffit.
	let { songs }: { songs: { id: number; title: string }[] } = $props()

	const distinct = $derived(
		songs.filter((song, i) => songs.findIndex((s) => s.id === song.id) === i).slice(0, 4)
	)
</script>

{#if distinct.length === 4}
	<span class="mosaic" aria-hidden="true">
		{#each distinct as song (song.id)}
			<SongCover songId={song.id} title={song.title} />
		{/each}
	</span>
{:else if distinct.length > 0}
	<SongCover songId={distinct[0].id} title={distinct[0].title} />
{:else}
	<span class="empty" aria-hidden="true"><Icon name="playlist" size="2rem" /></span>
{/if}

<style>
	.mosaic {
		width: 100%;
		height: 100%;
		display: grid;
		grid-template-columns: 1fr 1fr;
		grid-template-rows: 1fr 1fr;
	}

	/* Dans la mosaïque, les pochettes se touchent : c'est un seul visuel. */
	.mosaic :global(.song-cover) { border-radius: 0; }

	.empty {
		width: 100%;
		height: 100%;
		display: grid;
		place-items: center;
		background: var(--color-bg-muted);
		color: var(--color-text-muted);
	}
</style>
