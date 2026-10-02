<script lang="ts">
	import type { PageData, ActionData } from './$types'
	import type { Song } from '$lib/types'
	import { enhance } from '$app/forms'
	import { page } from '$app/state'
	import Modal from '$lib/components/Modal.svelte'
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte'
	import { createSubmitConfirm } from '$lib/confirm-submit.svelte'
	import Icon from '$lib/components/Icon.svelte'
	import AddToSetlistButton from '$lib/components/AddToSetlistButton.svelte'
	import MediaHeader from '$lib/components/MediaHeader.svelte'
	import IconCover from '$lib/components/IconCover.svelte'
	import SongListRow from '$lib/components/SongListRow.svelte'
	import SongFields from '$lib/components/SongFields.svelte'
	import type { IconName } from '$lib/icons'
	import { SONG_STATUS_LABELS, isPlaceholderSongTitle } from '$lib/songs'

	let { data, form }: { data: PageData; form: ActionData } = $props()

	const ask = createSubmitConfirm()

	// La liste se lit par défaut ; le tableau (édition sur place, suppression) est le
	// mode édition, pour qu'on parcoure le référentiel sans une rangée de boutons par ligne.
	let editMode = $state(false)

	function toggleEditMode() {
		editMode = !editMode
		if (!editMode) cancelEditing()
	}

	let editingId = $state<number | null>(null)
	let editError = $state<string | null>(null)

	function startEditing(id: number) {
		editError = null
		editingId = id
	}

	function cancelEditing() {
		editingId = null
		editError = null
	}

	// Fiche enregistrée, mais pochette du catalogue non importée : on le dit, sans défaire.
	let coverNotice = $state<string | null>(null)

	function readCoverError(data: unknown): string | null {
		const error = (data as { cover_error?: unknown } | undefined)?.cover_error
		return typeof error === 'string' ? `La pochette n'a pas pu être importée : ${error}` : null
	}

	let showCreateModal = $state(false)
	let createSuccess = $state(false)
	let createError = $state<string | null>(null)

	function openCreateModal() {
		createError = null
		createSuccess = false
		showCreateModal = true
	}

	// ─── Filtrage / tri (côté client : la liste complète est déjà chargée) ───
	type SongRow = Song & { take_count: number; cover_version: number | null }
	type SortKey = 'title' | 'take_count' | 'status'

	let search = $state('')
	// Pas un statut : les morceaux créés à la volée au classement d'une prise, sous un
	// titre provisoire. Le filtre existe pour qu'ils ne s'accumulent pas sans qu'on le voie ;
	// `?filtre=a_nommer` l'ouvre d'emblée (lien « À toi » du tableau de bord).
	const PLACEHOLDER_FILTER = 'a_nommer'
	let statusFilter = $state<string>(
		page.url.searchParams.get('filtre') === PLACEHOLDER_FILTER ? PLACEHOLDER_FILTER : 'all'
	)
	let sortKey = $state<SortKey>('title')
	let sortAsc = $state(true)

	const allSongs = $derived(data.songs as unknown as SongRow[])

	const statusCounts = $derived.by(() => {
		const counts: Record<string, number> = { all: allSongs.length }
		for (const s of allSongs) counts[s.status] = (counts[s.status] ?? 0) + 1
		counts[PLACEHOLDER_FILTER] = allSongs.filter((s) => isPlaceholderSongTitle(s.title)).length
		return counts
	})

	function toggleSort(key: SortKey) {
		if (sortKey === key) sortAsc = !sortAsc
		else {
			sortKey = key
			// Le nombre de prises est plus parlant en décroissant par défaut
			sortAsc = key !== 'take_count'
		}
	}

	// La colonne triée porte une flèche du jeu d'icônes : les flèches typographiques
	// n'ont ni la même graisse ni la même hauteur d'une plateforme à l'autre.
	function sortIcon(key: SortKey): IconName | null {
		if (sortKey !== key) return null
		return sortAsc ? 'arrow-up' : 'arrow-down'
	}

	const visibleSongs = $derived.by(() => {
		const q = search.trim().toLowerCase()
		const rows = allSongs.filter((s) => {
			if (statusFilter === PLACEHOLDER_FILTER) {
				if (!isPlaceholderSongTitle(s.title)) return false
			} else if (statusFilter !== 'all' && s.status !== statusFilter) return false
			if (!q) return true
			return (
				s.title.toLowerCase().includes(q) ||
				(s.composer?.toLowerCase().includes(q) ?? false) ||
				(s.original_artist?.toLowerCase().includes(q) ?? false) ||
				(s.key?.toLowerCase().includes(q) ?? false)
			)
		})

		const dir = sortAsc ? 1 : -1
		return rows.sort((a, b) => {
			if (sortKey === 'take_count') {
				const diff = a.take_count - b.take_count
				return diff !== 0 ? diff * dir : a.title.localeCompare(b.title, 'fr')
			}
			if (sortKey === 'status') {
				const diff = a.status.localeCompare(b.status, 'fr')
				return diff !== 0 ? diff * dir : a.title.localeCompare(b.title, 'fr')
			}
			return a.title.localeCompare(b.title, 'fr') * dir
		})
	})

	// En lecture, pas d'en-têtes de colonnes à cliquer : le tri se choisit dans la barre
	// de filtres, avec le sens le plus parlant pour chaque critère.
	function chooseSort(key: SortKey) {
		sortKey = key
		sortAsc = key !== 'take_count'
	}

	const totalTakes = $derived(allSongs.reduce((n, s) => n + s.take_count, 0))
	const headerStats = $derived(
		[
			`${allSongs.length} morceau${allSongs.length > 1 ? 'x' : ''}`,
			statusCounts.au_repertoire ? `${statusCounts.au_repertoire} au répertoire` : null,
			`${totalTakes} prise${totalTakes > 1 ? 's' : ''}`
		]
			.filter(Boolean)
			.join(' · ')
	)
	function resetFilters() {
		search = ''
		statusFilter = 'all'
	}

	const isFiltered = $derived(search.trim() !== '' || statusFilter !== 'all')
</script>

<svelte:head>
	<title>Morceaux</title>
</svelte:head>

<main class="page page-wide">
	<MediaHeader title="Morceaux" stats={allSongs.length > 0 ? headerStats : null}>
		{#snippet kicker()}Référentiel{/snippet}
		{#snippet cover()}
			<IconCover icon="music" />
		{/snippet}
		{#snippet actions()}
			<button class="btn btn-ghost mh-secondary" onclick={openCreateModal}>
				<Icon name="plus" size="0.9rem" /> <span class="mh-label">Ajouter</span>
			</button>
			{#if allSongs.length > 0}
				<!-- En édition, « Terminer » prend le ton principal : c'est l'état dont on sort. -->
				<button
					class="btn {editMode ? 'btn-primary' : 'btn-ghost mh-secondary'}"
					aria-pressed={editMode}
					onclick={toggleEditMode}
				>
					<Icon name={editMode ? 'check' : 'pencil'} size="0.9rem" />
					<span class="mh-label">{editMode ? 'Terminer' : 'Modifier'}</span>
				</button>
			{/if}
		{/snippet}
	</MediaHeader>

	{#if createSuccess}
		<p class="message-success">Morceau ajouté.</p>
	{/if}
	{#if coverNotice}
		<p class="message-error">{coverNotice}</p>
	{/if}

	<!-- Liste des morceaux -->
	<section class="songs-list">
		{#if allSongs.length === 0}
			<p class="empty">Aucun morceau pour l'instant.</p>
		{:else}
			<div class="filters">
				<input
					class="form-input search-input"
					type="search"
					placeholder="Rechercher un titre, un compositeur, un artiste original, une tonalité…"
					bind:value={search}
					autocomplete="off"
				/>
				<div class="status-filters">
					<button
						class="filter-pill"
						class:active={statusFilter === 'all'}
						onclick={() => (statusFilter = 'all')}
					>Tous <span class="pill-count">{statusCounts.all}</span></button>
					{#each Object.entries(SONG_STATUS_LABELS) as [value, label]}
						{#if statusCounts[value]}
							<button
								class="filter-pill filter-{value}"
								class:active={statusFilter === value}
								onclick={() => (statusFilter = value)}
							>{label} <span class="pill-count">{statusCounts[value]}</span></button>
						{/if}
					{/each}
					{#if statusCounts[PLACEHOLDER_FILTER]}
						<button
							class="filter-pill filter-placeholder"
							class:active={statusFilter === PLACEHOLDER_FILTER}
							onclick={() => (statusFilter = PLACEHOLDER_FILTER)}
						>À nommer <span class="pill-count">{statusCounts[PLACEHOLDER_FILTER]}</span></button>
					{/if}
				</div>
				{#if !editMode}
					<label class="sort-field">
						<span class="sort-label">Trier</span>
						<select
							class="form-input sort-select"
							value={sortKey}
							onchange={(e) => chooseSort((e.currentTarget as HTMLSelectElement).value as SortKey)}
						>
							<option value="title">Titre</option>
							<option value="take_count">Nombre de prises</option>
							<option value="status">Statut</option>
						</select>
					</label>
				{/if}
			</div>

			{#if isFiltered && visibleSongs.length > 0}
				<p class="result-count">
					{visibleSongs.length} morceau{visibleSongs.length > 1 ? 'x' : ''} sur {allSongs.length}
					· <button class="btn-link" onclick={resetFilters}>Réinitialiser</button>
				</p>
			{/if}

			{#if visibleSongs.length === 0}
				<p class="empty">
					Aucun morceau ne correspond.
					<button class="btn-link" onclick={resetFilters}>Réinitialiser les filtres</button>
				</p>
			{:else if !editMode}
			<div class="song-list">
				{#each visibleSongs as song (song.id)}
					<SongListRow {song} statusLabel={SONG_STATUS_LABELS[song.status] ?? song.status} />
				{/each}
			</div>
			{:else}
			<div class="table-scroll">
				<table class="data-table">
					<thead>
						<tr>
							<th>
								<button class="th-sort" onclick={() => toggleSort('title')}>
									Titre
									{#if sortIcon('title')}<Icon name={sortIcon('title')!} size="0.75rem" />{/if}
								</button>
							</th>
							<th>Compositeur</th>
							<th>Tonalité</th>
							<th>
								<button class="th-sort" onclick={() => toggleSort('status')}>
									Statut
									{#if sortIcon('status')}<Icon name={sortIcon('status')!} size="0.75rem" />{/if}
								</button>
							</th>
							<th>
								<button class="th-sort" onclick={() => toggleSort('take_count')}>
									Prises
									{#if sortIcon('take_count')}<Icon name={sortIcon('take_count')!} size="0.75rem" />{/if}
								</button>
							</th>
							<th>Actions</th>
						</tr>
					</thead>
					<tbody>
						{#each visibleSongs as song (song.id)}
							{@const isEditing = editingId === song.id}
							{@const isAbandoned = song.status === 'abandonne'}

							{#if isEditing}
								<!-- Ligne d'édition inline -->
								<tr class="editing-row">
									<td colspan="6">
										{#if editError}
											<p class="message-error">{editError}</p>
										{/if}
										<form
											method="POST"
											action="?/update"
											class="inline-edit-form"
											use:enhance={() => {
												editError = null
												return async ({ result, update }) => {
													if (result.type === 'failure') {
														editError = (result.data as { error?: string } | undefined)?.error ?? 'Erreur.'
														return
													}
													coverNotice = result.type === 'success' ? readCoverError(result.data) : null
													await update()
													editingId = null
												}
											}}
										>
											<input type="hidden" name="id" value={song.id} />
											<SongFields {song} />
											<div class="inline-actions">
												<button type="submit" class="btn btn-primary">Enregistrer</button>
												<button type="button" class="btn btn-ghost" onclick={cancelEditing}>
													Annuler
												</button>
											</div>
										</form>
									</td>
								</tr>
							{:else}
								<!-- Ligne normale -->
								<tr class:abandoned={isAbandoned}>
									<td class="title">
										<a href="/songs/{song.id}">{song.title}</a>
										{#if isPlaceholderSongTitle(song.title)}
											<span class="placeholder-tag" title="Titre provisoire, donné au classement d'une prise">à nommer</span>
										{/if}
										{#if song.release_year}<span class="year-tag">{song.release_year}</span>{/if}
									</td>
									<td data-label="Compositeur">
										{song.composer ?? '—'}
										{#if song.original_artist}
											<span class="original-artist">reprise de {song.original_artist}</span>
										{/if}
									</td>
									<td data-label="Tonalité">{song.key ?? '—'}</td>
									<td class="status-cell">
										<span class="badge badge-{song.status}">
											{SONG_STATUS_LABELS[song.status] ?? song.status}
										</span>
									</td>
									<td class="center" data-label="Prises">{song.take_count}</td>
									<td class="actions-cell">
										<!-- Programmer avant d'entretenir : on parcourt le référentiel pour
										     bâtir une setlist bien plus souvent que pour corriger une fiche.
										     Le bouton s'efface de lui-même sur un morceau abandonné. -->
										<AddToSetlistButton
											songId={song.id}
											songStatus={song.status}
											label="Setlist"
											buttonClass="btn btn-sm"
										/>
										<button class="btn btn-sm" onclick={() => startEditing(song.id)}> Modifier </button>

										{#if song.take_count === 0}
											<form
												method="POST"
												action="?/delete"
												use:enhance={({ formElement, cancel }) => {
													ask.intercept(formElement, cancel, {
														level: 'danger',
														title: 'Supprimer ce morceau ?',
														message: `« ${song.title} » sera retiré du référentiel, avec ses paroles, ses notes, sa pochette, sa feuille de répétition et sa place dans les setlists. Cette action est irréversible.`,
														confirmLabel: 'Supprimer le morceau'
													})
												}}
											>
												<input type="hidden" name="id" value={song.id} />
												<button type="submit" class="btn btn-sm btn-danger">Supprimer</button>
											</form>
										{:else}
											<button class="btn btn-sm btn-danger" disabled title="Des prises existent">
												Supprimer
											</button>
										{/if}
									</td>
								</tr>
							{/if}
						{/each}
					</tbody>
				</table>
			</div>
			{/if}
		{/if}

		{#if form?.action === 'delete' && form.error}
			<p class="message-error">{form.error}</p>
		{/if}
	</section>

	<ConfirmDialog
		open={ask.pending !== null}
		level={ask.pending?.level}
		title={ask.pending?.title ?? ''}
		message={ask.pending?.message ?? ''}
		confirmLabel={ask.pending?.confirmLabel}
		onConfirm={ask.confirm}
		onCancel={ask.dismiss}
	/>
</main>

<!-- Modale d'ajout -->
{#if showCreateModal}
	<Modal title="Ajouter un morceau" onClose={() => (showCreateModal = false)}>
		<form
			method="POST"
			action="?/create"
			use:enhance={() => {
				createError = null
				return async ({ result, update }) => {
					// En cas d'échec, on garde la saisie de l'utilisateur dans la modale
					if (result.type === 'failure') {
						createError = (result.data as { error?: string } | undefined)?.error ?? 'Erreur.'
						return
					}
					coverNotice = result.type === 'success' ? readCoverError(result.data) : null
					await update()
					showCreateModal = false
					createSuccess = true
				}
			}}
		>
			<div class="modal-body">
				{#if createError}
					<p class="message-error">{createError}</p>
				{/if}
				<SongFields />
			</div>
			<div class="modal-footer">
				<button type="button" class="btn btn-ghost" onclick={() => (showCreateModal = false)}>
					Annuler
				</button>
				<button type="submit" class="btn btn-primary">Ajouter</button>
			</div>
		</form>
	</Modal>
{/if}

<style>
	.sort-field {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		margin-left: auto;
	}

	.sort-label {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
	}

	.sort-select {
		width: auto;
		padding-block: 0.25rem;
		font-size: var(--text-sm);
	}

	.result-count {
		margin: -0.4rem 0 0.75rem;
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}

	.filters {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem;
		margin-bottom: 1rem;
	}

	.search-input {
		flex: 1 1 260px;
		min-width: 0;
	}

	.status-filters {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}

	.filter-pill {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		background: var(--color-bg-subtle);
		border: 1px solid var(--color-border-light);
		border-radius: var(--radius-pill);
		padding: 0.25rem 0.7rem;
		font-size: var(--text-xs);
		font-family: inherit;
		color: var(--color-text-secondary);
		cursor: pointer;
		transition: background 0.1s, color 0.1s, border-color 0.1s;
	}

	.filter-pill:hover { border-color: var(--color-border); }

	.filter-pill.active {
		background: var(--color-ink);
		border-color: var(--color-ink);
		color: #fff;
	}

	.pill-count {
		font-size: var(--text-2xs);
		font-weight: 700;
		opacity: 0.65;
	}

	.filter-placeholder:not(.active) { border-style: dashed; }

	.placeholder-tag {
		margin-left: 0.35rem;
		padding: 0.05rem 0.4rem;
		border: 1px dashed var(--color-border);
		border-radius: var(--radius-pill);
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		white-space: nowrap;
	}

	.th-sort {
		background: none;
		border: none;
		padding: 0;
		font: inherit;
		color: inherit;
		cursor: pointer;
	}

	.th-sort:hover { text-decoration: underline; }

	section {
		margin-bottom: 3rem;
	}

	.message-success { margin: 0 0 1.5rem; }

	td.center { text-align: center; }
	td.title { font-weight: 600; }
	td.title a { color: inherit; text-decoration: none; }
	td.title a:hover { text-decoration: underline; }

	.year-tag {
		margin-left: 0.35rem;
		font-size: var(--text-2xs);
		font-weight: 400;
		color: var(--color-text-muted);
	}

	.original-artist {
		display: block;
		font-size: var(--text-xs);
		font-weight: 400;
		color: var(--color-text-muted);
		font-style: italic;
	}

	tr.abandoned td { opacity: 0.5; }

	.editing-row td {
		background: var(--color-bg-subtle);
		padding: 1rem 0.75rem;
	}

	.inline-edit-form :global(.fields-create) { margin-bottom: 0.5rem; }

	.inline-actions { display: flex; gap: 0.5rem; }

	.actions-cell {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.actions-cell form { margin: 0; }

	.empty { font-size: var(--text-sm); }
	.message-error { margin: 0 0 0.5rem; }

	/* ─── Responsive ───────────────────── */
	@media (max-width: 640px) {

		/* Recherche et tri partagent la première rangée ; les pastilles tiennent sur une
		   ligne qui défile au doigt plutôt que de s'empiler sur deux ou trois. */
		.filters { gap: 0.5rem; margin-bottom: 0.75rem; }
		.search-input { flex: 1 1 8rem; order: 1; }
		.sort-field { order: 2; margin-left: 0; }
		.sort-label {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip: rect(0 0 0 0);
			white-space: nowrap;
		}
		.status-filters {
			order: 3;
			flex: 1 1 100%;
			flex-wrap: nowrap;
			overflow-x: auto;
			scrollbar-width: none;
			margin-inline: -0.75rem;
			padding-inline: 0.75rem;
		}
		.status-filters::-webkit-scrollbar { display: none; }
		.filter-pill { flex-shrink: 0; }

		/* La table devient une pile de cartes */
		td.title,
		td.status-cell,
		td.actions-cell,
		.editing-row td {
			flex: 1 1 100%;
		}

		td.title { font-size: var(--text-base); }
		td.center { text-align: left; }

		.actions-cell { margin-top: 0.35rem; }
		.actions-cell > * { flex: 1; }
		.actions-cell .btn { width: 100%; }
		/* Le bouton de setlist vient d'un composant : le scope du parent ne l'atteint
		   qu'en le nommant, sinon il resterait seul à sa largeur naturelle. */
		.actions-cell :global(.setlist-add-button) { flex: 1; width: 100%; }

		.editing-row td { padding: 0.75rem; }
		.inline-actions .btn { flex: 1; }
	}
</style>
