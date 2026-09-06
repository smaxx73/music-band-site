<script lang="ts">
	let {
		lyrics = null,
		musicNotes = null,
		compact = false,
		open = false
	}: {
		lyrics?: string | null
		musicNotes?: string | null
		compact?: boolean
		/** Ouvre les blocs au chargement (pages où les paroles sont le contenu principal). */
		open?: boolean
	} = $props()

	function lineCount(text: string) {
		return text.trim().split(/\r?\n/).length
	}
</script>

{#if lyrics || musicNotes}
	<section class="song-details" class:compact>
		{#if lyrics}
			<details {open}>
				<summary>
					<span class="chevron" aria-hidden="true">▸</span>
					<span class="label">Paroles</span>
					<span class="hint">{lineCount(lyrics)} ligne{lineCount(lyrics) > 1 ? 's' : ''}</span>
				</summary>
				<div class="text-block">{lyrics}</div>
			</details>
		{/if}

		{#if musicNotes}
			<details {open}>
				<summary>
					<span class="chevron" aria-hidden="true">▸</span>
					<span class="label">Accords / infos musicales</span>
					<span class="hint">{lineCount(musicNotes)} ligne{lineCount(musicNotes) > 1 ? 's' : ''}</span>
				</summary>
				<div class="text-block">{musicNotes}</div>
			</details>
		{/if}
	</section>
{/if}

<style>
	.song-details {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 1.5rem;
	}

	.song-details.compact {
		margin: 0.5rem 0 0.75rem;
	}

	details {
		flex: 1 1 100%;
		border: 1px solid var(--color-border-light);
		border-radius: var(--radius-sm);
		background: var(--color-bg-subtle);
	}

	/* Repliés, les deux blocs tiennent côte à côte ; ouverts, ils reprennent
	   toute la largeur pour rester lisibles. */
	details:not([open]) {
		flex: 1 1 auto;
	}

	summary {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.4rem 0.6rem;
		cursor: pointer;
		user-select: none;
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--color-text-secondary);
		list-style: none;
	}

	summary::-webkit-details-marker { display: none; }

	summary:hover { color: var(--color-text); }

	.chevron {
		font-size: 0.7rem;
		transition: transform 0.15s ease;
	}

	details[open] .chevron {
		transform: rotate(90deg);
	}

	.hint {
		font-weight: 400;
		font-size: var(--text-xs);
		color: var(--color-text-muted);
	}

	.text-block {
		white-space: pre-wrap;
		line-height: 1.6;
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		padding: 0.6rem;
		border-top: 1px solid var(--color-border-light);
		max-height: 18rem;
		overflow-y: auto;
	}

	.compact .text-block {
		max-height: 12rem;
		line-height: 1.5;
	}
</style>
