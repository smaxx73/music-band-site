<script lang="ts">
	import type { PageData, ActionData } from './$types'
	import type { Song } from '$lib/types'
	import { enhance } from '$app/forms'
	import Modal from '$lib/components/Modal.svelte'
	import Icon from '$lib/components/Icon.svelte'
	import AddToSetlistButton from '$lib/components/AddToSetlistButton.svelte'
	import MediaHeader from '$lib/components/MediaHeader.svelte'
	import IconCover from '$lib/components/IconCover.svelte'
	import SongListRow from '$lib/components/SongListRow.svelte'
	import CatalogSearch, { type CatalogTrack } from '$lib/components/CatalogSearch.svelte'
	import type { IconName } from '$lib/icons'
	import { isPlaceholderSongTitle } from '$lib/songs'

	let { data, form }: { data: PageData; form: ActionData } = $props()

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

	const STATUS_LABELS: Record<string, string> = {
		en_apprentissage: 'En apprentissage',
		proposition_de_travail: 'Proposition de travail',
		au_repertoire: 'Au répertoire',
		abandonne: 'Abandonné'
	}

	// Un titre choisi dans le catalogue remplit la fiche qu'on est en train d'écrire. Les
	// champs restent modifiables : c'est une aide à la saisie, pas une source qui fait foi.
	// Le compositeur n'est pas repris — Deezer ne connaît que les interprètes.
	function fillFromCatalog(track: CatalogTrack, root: HTMLElement) {
		const form = root.closest('form')
		if (!form) return
		const set = (name: string, value: string) => {
			const field = form.elements.namedItem(name)
			if (field instanceof HTMLInputElement) field.value = value
		}
		set('title', track.title)
		set('original_artist', track.artist)
		if (track.release_year) set('release_year', String(track.release_year))
		if (track.duration_s) set('reference_duration', formatDurationInput(track.duration_s))
	}

	// Préremplit le champ de durée en édition ("3:45"), au format attendu en retour du formulaire.
	function formatDurationInput(s: number | null | undefined) {
		if (!s && s !== 0) return ''
		const m = Math.floor(s / 60)
		const sec = s % 60
		return `${m}:${String(sec).padStart(2, '0')}`
	}

	// ─── Filtrage / tri (côté client : la liste complète est déjà chargée) ───
	type SongRow = Song & { take_count: number; cover_version: number | null }
	type SortKey = 'title' | 'take_count' | 'status'

	let search = $state('')
	let statusFilter = $state<string>('all')
	// Pas un statut : les morceaux créés à la volée au classement d'une prise, sous un
	// titre provisoire. Le filtre existe pour qu'ils ne s'accumulent pas sans qu'on le voie.
	const PLACEHOLDER_FILTER = 'a_nommer'
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

<!-- Champs partagés entre la modale d'ajout et l'édition inline -->
{#snippet songFields(song: Song | null)}
	<div class="fields-create">
		<CatalogSearch
			name="deezer_track_id"
			initialQuery={song ? [song.title, song.original_artist].filter(Boolean).join(' ') : ''}
			onPick={fillFromCatalog}
		/>
		<label class="form-label">
			<span>Titre <span class="required">*</span></span>
			<input
				class="form-input"
				type="text"
				name="title"
				value={song?.title ?? ''}
				required
				autocomplete="off"
			/>
		</label>
		<div class="fields-row">
			<label class="form-label">
				Compositeur
				<input class="form-input" type="text" name="composer" value={song?.composer ?? ''} />
			</label>
			<label class="form-label tonalite">
				Tonalité
				<input
					class="form-input"
					type="text"
					name="key"
					value={song?.key ?? ''}
					placeholder="ex : Dm, Bb"
				/>
			</label>
			<label class="form-label statut">
				Statut
				<select class="form-input" name="status">
					{#each Object.entries(STATUS_LABELS) as [value, label]}
						<option {value} selected={song ? song.status === value : value === 'en_apprentissage'}>
							{label}
						</option>
					{/each}
				</select>
			</label>
		</div>
		<div class="fields-row fields-row-secondary">
			<label class="form-label">
				Artiste/groupe original
				<input
					class="form-input"
					type="text"
					name="original_artist"
					value={song?.original_artist ?? ''}
					placeholder="si reprise"
				/>
			</label>
			<label class="form-label annee">
				Année de sortie
				<input
					class="form-input"
					type="text"
					inputmode="numeric"
					name="release_year"
					value={song?.release_year ?? ''}
					placeholder="AAAA"
					maxlength="4"
				/>
			</label>
			<label class="form-label duree">
				Durée de référence
				<input
					class="form-input"
					type="text"
					name="reference_duration"
					value={formatDurationInput(song?.reference_duration_s)}
					placeholder="mm:ss"
				/>
			</label>
		</div>
		<details class="optional-details" open={Boolean(song?.lyrics || song?.music_notes)}>
			<summary>Paroles et notes musicales <span class="optional-hint">(optionnel)</span></summary>
			<div class="fields-optional">
				<label class="form-label">
					Paroles
					<textarea class="form-input" name="lyrics" rows="6" value={song?.lyrics ?? ''}></textarea>
				</label>
				<label class="form-label">
					Accords / infos musicales
					<textarea
						class="form-input"
						name="music_notes"
						rows="6"
						value={song?.music_notes ?? ''}
						placeholder="Accords, structure, tempo, remarques..."
					></textarea>
				</label>
			</div>
		</details>
	</div>
{/snippet}

<main>
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
					{#each Object.entries(STATUS_LABELS) as [value, label]}
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
					· <button class="link-btn" onclick={resetFilters}>Réinitialiser</button>
				</p>
			{/if}

			{#if visibleSongs.length === 0}
				<p class="empty">
					Aucun morceau ne correspond.
					<button class="link-btn" onclick={resetFilters}>Réinitialiser les filtres</button>
				</p>
			{:else if !editMode}
			<div class="song-list">
				{#each visibleSongs as song (song.id)}
					<SongListRow {song} statusLabel={STATUS_LABELS[song.status] ?? song.status} />
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
											{@render songFields(song)}
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
											{STATUS_LABELS[song.status] ?? song.status}
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
												use:enhance
												onsubmit={(e) => {
													if (!confirm(`Supprimer "${song.title}" ?`)) e.preventDefault()
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
				{@render songFields(null)}
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
	main {
		max-width: 900px;
		margin: 2rem auto;
		padding: 0 1rem;
	}

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
		border-radius: 999px;
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
		font-size: 0.65rem;
		font-weight: 700;
		opacity: 0.65;
	}

	.filter-placeholder:not(.active) { border-style: dashed; }

	.placeholder-tag {
		margin-left: 0.35rem;
		padding: 0.05rem 0.4rem;
		border: 1px dashed var(--color-border);
		border-radius: 999px;
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

	.link-btn {
		background: none;
		border: none;
		padding: 0;
		font: inherit;
		color: var(--color-accent);
		cursor: pointer;
		text-decoration: underline;
	}

	section {
		margin-bottom: 3rem;
	}

	.fields-create {
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
	}

	.fields-row {
		display: grid;
		grid-template-columns: 1fr auto auto;
		gap: 0.65rem;
	}

	.fields-row .tonalite { width: 110px; }
	.fields-row .statut  { width: 175px; }

	.fields-row-secondary .annee { width: 110px; }
	.fields-row-secondary .duree { width: 110px; }

	.optional-details {
		border: 1px solid var(--color-border-light);
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.optional-details summary {
		padding: 0.5rem 0.75rem;
		font-size: var(--text-sm);
		font-weight: 600;
		cursor: pointer;
		user-select: none;
		background: var(--color-bg-subtle);
		list-style: none;
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.optional-details summary::before {
		content: '▸';
		font-size: 0.7rem;
		transition: transform 0.15s;
	}

	.optional-details[open] summary::before {
		transform: rotate(90deg);
	}

	.optional-hint {
		font-weight: 400;
		color: var(--color-text-muted);
		font-size: var(--text-xs);
	}

	.fields-optional {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.65rem;
		padding: 0.75rem;
	}

	textarea.form-input {
		resize: vertical;
		min-height: 7rem;
	}

	.required { color: var(--color-error); }

	.message-success {
		color: var(--color-repertoire-text, #166534);
		background: var(--color-repertoire-bg, #dcfce7);
		border-radius: var(--radius-md);
		padding: 0.4rem 0.75rem;
		font-size: var(--text-sm);
		margin: 0 0 1.5rem;
	}

	td.center { text-align: center; }
	td.title { font-weight: 600; }
	td.title a { color: inherit; text-decoration: none; }
	td.title a:hover { text-decoration: underline; }

	.year-tag {
		margin-left: 0.35rem;
		font-size: 0.7rem;
		font-weight: 400;
		color: var(--color-text-muted);
	}

	.original-artist {
		display: block;
		font-size: 0.75rem;
		font-weight: 400;
		color: var(--color-text-muted);
		font-style: italic;
	}

	tr.abandoned td { opacity: 0.5; }

	.editing-row td {
		background: #fffbe6;
		padding: 1rem 0.75rem;
	}

	.inline-edit-form .fields-create { margin-bottom: 0.5rem; }

	.inline-actions { display: flex; gap: 0.5rem; }

	.actions-cell {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.actions-cell form { margin: 0; }

	.empty { color: #aaa; font-style: italic; font-size: 0.9rem; }
	.message-error { color: #c0392b; font-size: 0.875rem; margin: 0 0 0.5rem; }

	/* ─── Responsive ───────────────────── */
	@media (max-width: 640px) {
		main { margin: 1rem auto; padding: 0 0.75rem; }

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

		.fields-row { grid-template-columns: 1fr; }
		.fields-row .tonalite,
		.fields-row .statut { width: auto; }
		.fields-row-secondary .annee,
		.fields-row-secondary .duree { width: auto; }

		.fields-optional { grid-template-columns: 1fr; }

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
