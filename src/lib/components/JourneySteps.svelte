<script lang="ts">
	import Icon from '$lib/components/Icon.svelte'

	/**
	 * Où l'on en est dans le parcours d'un enregistrement : enregistrer, classer, éventuellement
	 * découper, puis réécouter. Un repère, pas une navigation : rien ne se clique, et la découpe,
	 * par exemple, n'existe qu'une fois le fichier envoyé.
	 */
	let { steps, current }: { steps: string[]; current: number } = $props()
</script>

<ol class="journey" aria-label="Étapes">
	{#each steps as step, i}
		<li
			class:done={i < current}
			class:current={i === current}
			aria-current={i === current ? 'step' : undefined}
		>
			<span class="mark" aria-hidden="true">
				{#if i < current}<Icon name="check" size="0.7rem" />{:else}{i + 1}{/if}
			</span>
			<span class="label">{step}</span>
		</li>
	{/each}
</ol>

<style>
	.journey {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		list-style: none;
		margin: 0.25rem 0 0.75rem;
		padding: 0;
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
	}

	li {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		min-width: 0;
	}

	/* Le trait qui relie une étape à la suivante. */
	li + li::before {
		content: '';
		width: 1.25rem;
		height: 1px;
		background: var(--color-border);
		margin-right: 0.25rem;
	}

	.mark {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.3rem;
		height: 1.3rem;
		flex: none;
		border-radius: var(--radius-pill);
		border: 1px solid var(--color-border);
		font-size: var(--text-2xs);
		font-variant-numeric: tabular-nums;
	}

	.done .mark {
		background: var(--color-bg-subtle);
		color: var(--color-text);
	}

	.current { color: var(--color-text); font-weight: 600; }

	.current .mark {
		background: var(--color-ink);
		border-color: var(--color-ink);
		color: #fff;
	}

	/* Au téléphone, seule l'étape en cours garde son libellé : les autres restent des repères. */
	@media (max-width: 640px) {
		li:not(.current) .label { display: none; }
		li + li::before { width: 0.75rem; }
	}
</style>
