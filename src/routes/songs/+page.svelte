<script lang="ts">
	import type { PageData, ActionData } from './$types'
	import type { Song } from '$lib/types'
	import { enhance } from '$app/forms'
	import Modal from '$lib/components/Modal.svelte'

	let { data, form }: { data: PageData; form: ActionData } = $props()

	let editingId = $state<number | null>(null)

	function hasActionError(action: string, id: number) {
		const actionData = form as { action?: string; error?: string; id?: number } | null
		return actionData?.action === action && actionData.id === id && Boolean(actionData.error)
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
		au_repertoire: 'Au répertoire',
		abandonne: 'Abandonné'
	}

	// ─── Filtrage / tri (côté client : la liste complète est déjà chargée) ───
	type SongRow = Song & { take_count: number }
	type SortKey = 'title' | 'take_count' | 'status'

	let search = $state('')
	let statusFilter = $state<string>('all')
	let sortKey = $state<SortKey>('title')
	let sortAsc = $state(true)

	const allSongs = $derived(data.songs as unknown as SongRow[])

	const statusCounts = $derived.by(() => {
		const counts: Record<string, number> = { all: allSongs.length }
		for (const s of allSongs) counts[s.status] = (counts[s.status] ?? 0) + 1
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

	function sortIndicator(key: SortKey) {
		if (sortKey !== key) return ''
		return sortAsc ? ' ↑' : ' ↓'
	}

	const visibleSongs = $derived.by(() => {
		const q = search.trim().toLowerCase()
		const rows = allSongs.filter((s) => {
			if (statusFilter !== 'all' && s.status !== statusFilter) return false
			if (!q) return true
			return (
				s.title.toLowerCase().includes(q) ||
				(s.composer?.toLowerCase().includes(q) ?? false) ||
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
	<div class="page-header">
		<h1>Morceaux</h1>
		<button class="btn btn-primary" onclick={openCreateModal}>+ Ajouter un morceau</button>
	</div>

	{#if createSuccess}
		<p class="message-success">Morceau ajouté.</p>
	{/if}

	<!-- Liste des morceaux -->
	<section class="songs-list">
		<div class="list-header">
			<h2>
				Morceaux ({visibleSongs.length}{#if isFiltered}<span class="of-total"> / {allSongs.length}</span>{/if})
			</h2>
		</div>

		{#if allSongs.length === 0}
			<p class="empty">Aucun morceau pour l'instant.</p>
		{:else}
			<div class="filters">
				<input
					class="form-input search-input"
					type="search"
					placeholder="Rechercher un titre, un compositeur, une tonalité…"
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
				</div>
			</div>

			{#if visibleSongs.length === 0}
				<p class="empty">
					Aucun morceau ne correspond.
					<button class="link-btn" onclick={resetFilters}>Réinitialiser les filtres</button>
				</p>
			{:else}
			<table class="data-table">
				<thead>
					<tr>
						<th>
							<button class="th-sort" onclick={() => toggleSort('title')}>Titre{sortIndicator('title')}</button>
						</th>
						<th>Compositeur</th>
						<th>Tonalité</th>
						<th>
							<button class="th-sort" onclick={() => toggleSort('status')}>Statut{sortIndicator('status')}</button>
						</th>
						<th>
							<button class="th-sort" onclick={() => toggleSort('take_count')}>Prises{sortIndicator('take_count')}</button>
						</th>
						<th>Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each visibleSongs as song (song.id)}
						{@const isEditing = editingId === song.id}
						{@const hasError = hasActionError('update', song.id)}
						{@const isAbandoned = song.status === 'abandonne'}

						{#if isEditing}
							<!-- Ligne d'édition inline -->
							<tr class="editing-row">
								<td colspan="6">
									{#if hasError}
										<p class="message-error">{form?.error}</p>
									{/if}
									<form
										method="POST"
										action="?/update"
										class="inline-edit-form"
										use:enhance={() => {
											return ({ result }) => {
												if (result.type === 'success' || result.type === 'redirect') {
													editingId = null
												}
											}
										}}
									>
										<input type="hidden" name="id" value={song.id} />
										{@render songFields(song)}
										<div class="inline-actions">
											<button type="submit" class="btn btn-primary">Enregistrer</button>
											<button type="button" class="btn btn-ghost" onclick={() => (editingId = null)}>
												Annuler
											</button>
										</div>
									</form>
								</td>
							</tr>
						{:else}
							<!-- Ligne normale -->
							<tr class:abandoned={isAbandoned}>
								<td class="title"><a href="/songs/{song.id}">{song.title}</a></td>
								<td data-label="Compositeur">{song.composer ?? '—'}</td>
								<td data-label="Tonalité">{song.key ?? '—'}</td>
								<td class="status-cell">
									<span class="badge badge-{song.status}">
										{STATUS_LABELS[song.status] ?? song.status}
									</span>
								</td>
								<td class="center" data-label="Prises">{song.take_count}</td>
								<td class="actions-cell">
									<button class="btn btn-sm" onclick={() => (editingId = song.id)}> Modifier </button>

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

	.page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 2rem;
	}

	.list-header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
	}

	.of-total {
		color: var(--color-text-muted);
		font-weight: 400;
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

	h1 {
		font-size: var(--text-xl);
		margin: 0;
	}

	h2 {
		font-size: var(--text-lg);
		margin-bottom: 1rem;
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

		.page-header {
			align-items: stretch;
			flex-direction: column;
			gap: 0.75rem;
			margin-bottom: 1.5rem;
		}

		.fields-row { grid-template-columns: 1fr; }
		.fields-row .tonalite,
		.fields-row .statut { width: auto; }

		.fields-optional { grid-template-columns: 1fr; }

		/* La table devient une pile de cartes */
		.data-table,
		.data-table tbody,
		.data-table tr,
		.data-table td {
			display: block;
		}

		.data-table thead { display: none; }

		.data-table tr {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			gap: 0.35rem 0.9rem;
			border: 1px solid var(--color-border-light);
			border-radius: var(--radius-md);
			padding: 0.75rem;
			margin-bottom: 0.6rem;
		}

		.data-table td {
			border: none;
			padding: 0;
			min-width: 0;
		}

		.data-table td[data-label]::before {
			content: attr(data-label) ' ';
			font-size: var(--text-xs);
			text-transform: uppercase;
			color: var(--color-text-muted);
			margin-right: 0.3rem;
		}

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

		.editing-row td { padding: 0.75rem; }
		.inline-actions .btn { flex: 1; }
	}
</style>
