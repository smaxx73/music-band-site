<script lang="ts">
	import SongCover from '$lib/components/SongCover.svelte'
	import AddToSetlistButton from '$lib/components/AddToSetlistButton.svelte'
	import TrackRow from '$lib/components/TrackRow.svelte'
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

	// Un morceau du référentiel, en lecture : une pochette à la place du numéro, et le
	// nombre de prises à la place de la durée. Toute la ligne mène au morceau ; corriger
	// la fiche ou la supprimer se fait dans le mode édition de la page (le tableau).
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

{#snippet lead()}<SongCover songId={song.id} title={song.title} size={44} />{/snippet}

{#snippet title()}<a class="song-link" href="/songs/{song.id}">{song.title}</a>{/snippet}

{#snippet meta()}{origin || 'Compositeur inconnu'}{/snippet}

{#snippet tags()}
	{#if isPlaceholderSongTitle(song.title)}
		<span class="placeholder-tag" title="Titre provisoire, donné au classement d'une prise">à nommer</span>
	{/if}
	<span class="badge badge-{song.status}">{statusLabel}</span>
	{#if song.key}<span class="key" title="Tonalité">{song.key}</span>{/if}
{/snippet}

<!-- Programmer depuis la liste reste à portée : on parcourt le référentiel pour bâtir
     une setlist bien plus souvent que pour corriger une fiche. -->
{#snippet actions()}
	<span class="setlist">
		<AddToSetlistButton
			songId={song.id}
			songStatus={song.status}
			label="Setlist"
			buttonClass="btn btn-ghost btn-sm row-quiet"
		/>
	</span>
{/snippet}

{#snippet aside()}
	<span class:none={song.take_count === 0}>{song.take_count} prise{song.take_count > 1 ? 's' : ''}</span>
{/snippet}

<TrackRow dimmed={song.status === 'abandonne'} {lead} {title} {meta} {tags} {actions} {aside} />

<style>
	/* Le lien du titre couvre toute la ligne, qui est positionnée (`TrackRow`). */
	.song-link {
		color: inherit;
		text-decoration: none;
	}

	.song-link::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: var(--radius-lg);
	}

	.song-link:focus-visible { outline: none; }
	.song-link:focus-visible::after { outline: 2px solid var(--color-accent); outline-offset: -2px; }

	@media (hover: hover) and (pointer: fine) {
		.song-link:hover { color: var(--color-accent); }
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

	.none { color: var(--color-text-muted); }

	/* Au-dessus du lien étendu : le bouton reste cliquable pour lui-même. */
	.setlist {
		position: relative;
		z-index: 1;
		display: flex;
	}

	/* Ligne étroite (même seuil que `TrackRow`) : la setlist se réduit à son icône, pour
	   laisser le titre respirer. Le libellé reste lu par les lecteurs d'écran. */
	@container (max-width: 560px) {
		.setlist :global(.setlist-add-button) { padding-inline: 0.5rem; }
		.setlist :global(.setlist-add-button span) {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip: rect(0 0 0 0);
			white-space: nowrap;
		}
	}
</style>
