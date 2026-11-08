<script lang="ts">
	import type { Snippet } from 'svelte'
	import type { EventProgramSong } from '$lib/types'

	let { songs, children }: { songs: EventProgramSong[]; children?: Snippet } = $props()
</script>

<div class="program">
	<span class="label">Programme de travail</span>
	<ol class="songs">
		{#each songs as song (song.id)}
			<li><a href="/songs/{song.id}">{song.song_title}</a></li>
		{/each}
	</ol>
	{@render children?.()}
</div>

<style>
	.program {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.15rem;
	}

	.label {
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--color-text-secondary);
	}

	.songs {
		margin: 0;
		padding-left: 1.4rem;
		font-size: var(--text-sm);
	}

	.songs li::marker {
		color: var(--color-text-muted);
		font-size: var(--text-xs);
	}

	.songs a {
		color: inherit;
		text-decoration: none;
		overflow-wrap: anywhere;
	}

	.songs a:hover {
		color: var(--color-accent);
		text-decoration: underline;
	}
</style>
