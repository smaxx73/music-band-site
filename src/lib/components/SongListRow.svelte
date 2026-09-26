<script lang="ts">
	import SongCover from '$lib/components/SongCover.svelte'
	import AddToSetlistButton from '$lib/components/AddToSetlistButton.svelte'
	import { isPlaceholderSongTitle } from '$lib/songs'

	type Song = {
		id: number
		title: string
		composer: string | null
		original_artist: string | null
		release_year: number | null
		key: string | null
		status: string
		take_count: number
	}

	// Un morceau du référentiel, en lecture : pochette, titre, provenance, et ce qu'on
	// en a enregistré. Toute la ligne mène au morceau ; corriger la fiche ou la supprimer
	// se fait dans le mode édition de la page, qui garde le tableau.
	let { song, statusLabel }: { song: Song; statusLabel: string } = $props()

	const origin = $derived(
		[
			song.composer,
			song.original_artist ? `reprise de ${song.original_artist}` : null,
			song.release_year ? String(song.release_year) : null
		]
			.filter(Boolean)
			.join(' · ')
	)
</script>

<article class="song-row" class:abandoned={song.status === 'abandonne'}>
	<div class="row-grid">
		<SongCover songId={song.id} title={song.title} size={44} />

		<div class="row-body">
			<a class="row-title" href="/songs/{song.id}">{song.title}</a>
			<span class="row-meta">{origin || 'Compositeur inconnu'}</span>
		</div>

		<div class="row-tags">
			{#if isPlaceholderSongTitle(song.title)}
				<span class="placeholder-tag" title="Titre provisoire, donné au classement d'une prise">à nommer</span>
			{/if}
			<span class="badge badge-{song.status}">{statusLabel}</span>
			{#if song.key}<span class="key" title="Tonalité">{song.key}</span>{/if}
		</div>

		<span class="takes" class:none={song.take_count === 0}>
			{song.take_count} prise{song.take_count > 1 ? 's' : ''}
		</span>

		<!-- Programmer depuis la liste reste à portée : on parcourt le référentiel pour bâtir
		     une setlist bien plus souvent que pour corriger une fiche. -->
		<div class="row-actions">
			<AddToSetlistButton
				songId={song.id}
				songStatus={song.status}
				label="Setlist"
				buttonClass="btn btn-ghost btn-sm row-quiet"
			/>
		</div>
	</div>
</article>

<style>
	/* Mêmes mesures que les pistes d'une session ou d'une playlist : sans cadre, un fond
	   au survol. Le lien du titre couvre toute la ligne (voir `.row-title::after`).
	   La ligne est le conteneur, la grille son enfant : une requête de conteneur ne
	   s'applique jamais au conteneur lui-même. */
	.song-row {
		position: relative;
		container-type: inline-size;
		padding: 0.45rem 0.6rem 0.45rem 0.45rem;
		margin-bottom: 2px;
		border-radius: var(--radius-lg);
		transition: background 0.12s;
	}

	.row-grid {
		display: grid;
		grid-template-columns: 44px minmax(0, 1fr) auto auto auto;
		grid-template-areas: 'cover body tags takes actions';
		align-items: center;
		column-gap: 0.85rem;
	}

	.row-grid :global(.song-cover) { grid-area: cover; }

	.song-row.abandoned { opacity: 0.6; }

	.row-body {
		grid-area: body;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.row-title {
		font-weight: 600;
		font-size: 0.95rem;
		color: var(--color-text);
		text-decoration: none;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.row-title::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
	}

	.row-title:focus-visible { outline: none; }
	.row-title:focus-visible::after { outline: 2px solid var(--color-accent); outline-offset: -2px; }

	.row-meta {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.row-tags {
		grid-area: tags;
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.3rem;
	}

	.key {
		font-size: var(--text-xs);
		font-weight: 600;
		background: var(--color-abandoned-bg);
		color: var(--color-text-secondary);
		padding: 0.15rem 0.45rem;
		border-radius: var(--radius-sm);
	}

	.placeholder-tag {
		padding: 0.05rem 0.4rem;
		border: 1px dashed var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-xs);
		color: var(--color-text-muted);
	}

	.takes {
		grid-area: takes;
		min-width: 4.5rem;
		text-align: right;
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		font-variant-numeric: tabular-nums;
	}

	.takes.none { color: var(--color-text-muted); }

	/* Au-dessus du lien étendu : le bouton reste cliquable pour lui-même. */
	.row-actions {
		grid-area: actions;
		position: relative;
		z-index: 1;
		display: flex;
	}

	/* Ligne étroite, deux niveaux : titre et provenance en face du bouton setlist
	   réduit à son icône, puis pastilles et nombre de prises. Le titre n'est jamais
	   écrasé : il a toute la largeur entre la pochette et une seule icône. */
	@container (max-width: 560px) {
		.row-grid {
			grid-template-columns: 44px minmax(0, 1fr) auto;
			grid-template-areas:
				'cover body actions'
				'cover tags takes';
			row-gap: 0.15rem;
			column-gap: 0.7rem;
		}
		.row-grid :global(.song-cover) { align-self: start; }
		.row-tags { justify-self: start; }
		.takes { min-width: 0; font-size: var(--text-xs); }
		.row-actions :global(.setlist-add-button) { padding-inline: 0.5rem; }
		.row-actions :global(.setlist-add-button span) {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip: rect(0 0 0 0);
			white-space: nowrap;
		}
	}

	@media (hover: hover) and (pointer: fine) {
		.song-row:hover { background: var(--color-bg-muted); }
		.song-row:hover .row-title { color: var(--color-accent); }
		.row-actions :global(.row-quiet) { opacity: 0; transition: opacity 0.12s; }
		.song-row:hover .row-actions :global(.row-quiet),
		.song-row:focus-within .row-actions :global(.row-quiet) { opacity: 1; }
	}

	@media (max-width: 640px) {
		.song-row { padding-block: 0.35rem; }
		.row-actions :global(.btn) { min-height: 44px; }
	}
</style>
