<script lang="ts">
	let {
		lyrics = null,
		musicNotes = null,
		compact = false
	}: {
		lyrics?: string | null
		musicNotes?: string | null
		compact?: boolean
	} = $props()
</script>

{#if lyrics || musicNotes}
	<section class="song-details" class:compact>
		{#if lyrics}
			<article>
				<h2>Paroles</h2>
				<div class="text-block">{lyrics}</div>
			</article>
		{/if}

		{#if musicNotes}
			<article>
				<h2>Accords / infos musicales</h2>
				<div class="text-block">{musicNotes}</div>
			</article>
		{/if}
	</section>
{/if}

<style>
	.song-details {
		display: grid;
		gap: 1.25rem;
		margin-bottom: 2rem;
	}

	.song-details.compact {
		gap: 0.85rem;
		margin: 0.75rem 0 1rem;
	}

	article {
		border-top: 1px solid var(--color-border);
		padding-top: 1rem;
	}

	.compact article {
		padding-top: 0.75rem;
	}

	h2 {
		font-size: 1.05rem;
		margin: 0 0 0.75rem;
	}

	.compact h2 {
		font-size: var(--text-sm);
		margin-bottom: 0.4rem;
	}

	.text-block {
		white-space: pre-wrap;
		line-height: 1.6;
		color: var(--color-text-secondary);
	}

	.compact .text-block {
		font-size: var(--text-sm);
		line-height: 1.5;
	}
</style>
