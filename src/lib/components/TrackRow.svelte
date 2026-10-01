<script lang="ts">
	import type { Snippet } from 'svelte'

	// Une piste, quelle que soit la page : prise d'une session ou d'un morceau, piste de
	// playlist, morceau du référentiel. Ce composant porte seul la grille, le repli sur
	// ligne étroite, le survol, l'état « en cours » et les commandes discrètes ; chaque
	// liste n'y met que son contenu. Deux lignes voisines ne peuvent donc pas diverger.
	//
	// Classes que le contenu peut poser, et que la ligne interprète :
	// - `row-quiet` : commande secondaire, qui ne paraît qu'au survol à la souris ;
	// - `row-play`  : bouton ▶ de droite, remplacé à la souris par celui de la tête
	//   (`TrackLead`) quand la piste a de l'audio.
	let {
		current = false,
		hasAudio = false,
		expanded = false,
		dimmed = false,
		lead,
		title,
		meta,
		tags,
		actions,
		aside,
		below,
		after
	}: {
		/** La piste que joue le mini-lecteur. */
		current?: boolean
		hasAudio?: boolean
		/** Dépliée : la ligne redevient une carte, pour que `after` ait des bords à rejoindre. */
		expanded?: boolean
		/** Estompée (morceau abandonné). */
		dimmed?: boolean
		/** Colonne de tête : `TrackLead` (numéro, ▶, égaliseur) ou une pochette. */
		lead: Snippet
		title: Snippet
		meta?: Snippet
		tags?: Snippet
		actions?: Snippet
		/** Valeur calée à droite, en chiffres alignés : durée, nombre de prises. */
		aside?: Snippet
		/** Pleine largeur sous le titre, dans la grille : une note dépliable. */
		below?: Snippet
		/** Tiroir sous la ligne, sur fond creusé : les commentaires. */
		after?: Snippet
	} = $props()
</script>

<article class="track-row" class:current class:has-audio={hasAudio} class:expanded class:dimmed>
	<div class="track-grid">
		<div class="track-lead">{@render lead()}</div>
		<div class="track-body">
			<div class="track-title">{@render title()}</div>
			{#if meta}<div class="track-meta">{@render meta()}</div>{/if}
		</div>
		{#if tags}<div class="track-tags">{@render tags()}</div>{/if}
		{#if actions}<div class="track-actions">{@render actions()}</div>{/if}
		{#if aside}<div class="track-aside">{@render aside()}</div>{/if}
		{#if below}<div class="track-below">{@render below()}</div>{/if}
	</div>
	{#if after}<div class="track-after">{@render after()}</div>{/if}
</article>

<style>
	/* Sans cadre, un fond au survol : une piste de tracklist. La ligne est le conteneur,
	   la grille son enfant — une requête de conteneur ne s'applique jamais au conteneur
	   lui-même —, et le repli suit la largeur de la liste, pas celle de la fenêtre. */
	.track-row {
		position: relative;
		container-type: inline-size;
		padding: 0.4rem 0.6rem 0.4rem 0.3rem;
		margin-bottom: 2px;
		border-radius: var(--radius-lg);
		transition: background 0.12s;
	}

	/* Orangé très pâle : assez pour retrouver la piste en cours, sans concurrencer
	   la pastille de qualité. */
	.track-row.current { background: color-mix(in srgb, var(--color-accent-light) 55%, var(--color-bg)); }

	.track-row.expanded,
	.track-row.expanded:hover {
		background: var(--color-bg);
		box-shadow: inset 0 0 0 1px var(--color-border-light);
		margin-block: 0.35rem;
	}

	.track-row.dimmed { opacity: 0.6; }

	.track-grid {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto auto auto;
		grid-template-areas:
			'lead body tags actions aside'
			'.    below below below below';
		align-items: center;
		column-gap: 0.75rem;
	}

	/* Ligne étroite : le titre garde toute la largeur entre la tête et les commandes ;
	   pastilles et valeur de droite passent au rang suivant. */
	@container (max-width: 560px) {
		.track-grid {
			grid-template-columns: auto minmax(0, 1fr) auto;
			grid-template-areas:
				'lead body  actions'
				'lead tags  aside'
				'.    below below';
			row-gap: 0.15rem;
		}
		.track-lead { align-self: start; }
		.track-tags { justify-self: start; }
		.track-aside { font-size: var(--text-xs); }
	}

	.track-lead { grid-area: lead; display: flex; }

	.track-body {
		grid-area: body;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.track-title,
	.track-meta {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.track-title { font-weight: 600; font-size: var(--text-base); }
	.current .track-title { color: var(--color-accent); }

	.track-meta {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
	}

	.track-tags {
		grid-area: tags;
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.3rem 0.4rem;
	}

	/* Le groupe de commandes ne se scinde jamais. */
	.track-actions {
		grid-area: actions;
		display: flex;
		align-items: center;
		flex-wrap: nowrap;
		gap: 0.2rem;
	}

	.track-aside {
		grid-area: aside;
		min-width: 2.6rem;
		text-align: right;
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.track-below { grid-area: below; min-width: 0; margin-top: 0.2rem; }

	/* Les commentaires d'une piste ne sont pas d'autres pistes : le tiroir est un fond
	   creusé qui rejoint les bords de la carte (marges négatives = retrait de la ligne).
	   `--color-bg-subtle`, surtout pas `--color-bg-muted`, jeton d'interaction : le
	   survol d'un bouton posé dans le tiroir s'y confondrait avec le fond. */
	.track-after {
		margin: 0.5rem -0.6rem -0.4rem -0.3rem;
		padding: 0.55rem 0.7rem 0.7rem;
		background: var(--color-bg-subtle);
		border-top: 1px solid var(--color-border-light);
		border-radius: 0 0 var(--radius-lg) var(--radius-lg);
	}

	/* Souris seulement : ▶ au survol de la tête (`TrackLead`), le ▶ de droite s'efface,
	   les commandes secondaires ne paraissent qu'au survol ou au focus. Au doigt, un
	   :hover collant demanderait deux touchers : tout reste visible. */
	@media (hover: hover) and (pointer: fine) {
		.track-row:hover { background: var(--color-bg-muted); }
		.track-row.current:hover { background: color-mix(in srgb, var(--color-accent-light) 80%, var(--color-bg)); }

		.has-audio :global(.row-play) { display: none; }

		.track-row :global(.row-quiet) { opacity: 0; transition: opacity 0.12s; }
		.track-row:hover :global(.row-quiet),
		.track-row:focus-within :global(.row-quiet) { opacity: 1; }
	}

	@media (max-width: 640px) {
		.track-actions :global(.btn) { min-height: 44px; min-width: 44px; }
	}
</style>
