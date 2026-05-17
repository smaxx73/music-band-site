<script lang="ts">
	import type { PageData, ActionData } from './$types'
	import { enhance } from '$app/forms'

	let { data, form }: { data: PageData; form: ActionData } = $props()

	let editingId = $state<number | null>(null)
	let createSuccess = $state(false)
	let createFormEl: HTMLFormElement

	const STATUS_LABELS: Record<string, string> = {
		en_apprentissage: 'En apprentissage',
		au_repertoire: 'Au répertoire',
		abandonne: 'Abandonné'
	}
</script>

<svelte:head>
	<title>Référentiel de morceaux — Admin</title>
</svelte:head>

<main>
	<nav class="breadcrumb">
		<a href="/admin">Admin</a> /
		<span>Morceaux</span>
	</nav>

	<h1>Référentiel de morceaux</h1>

	<!-- Formulaire d'ajout -->
	<section class="add-form form-section">
		<h2>Ajouter un morceau</h2>
		{#if form?.action === 'create' && form.error}
			<p class="message-error">{form.error}</p>
		{/if}
		{#if createSuccess}
			<p class="message-success">Morceau ajouté.</p>
		{/if}
		<form
			method="POST"
			action="?/create"
			bind:this={createFormEl}
			use:enhance={() => {
				createSuccess = false
				return async ({ result, update }) => {
					await update()
					if (result.type !== 'failure') {
						createFormEl?.reset()
						createSuccess = true
					}
				}
			}}
		>
			<div class="fields-create">
				<label class="form-label">
					<span>Titre <span class="required">*</span></span>
					<input class="form-input" type="text" name="title" required autocomplete="off" />
				</label>
				<div class="fields-row">
					<label class="form-label">
						Compositeur
						<input class="form-input" type="text" name="composer" />
					</label>
					<label class="form-label tonalite">
						Tonalité
						<input class="form-input" type="text" name="key" placeholder="ex : Dm, Bb" />
					</label>
					<label class="form-label statut">
						Statut
						<select class="form-input" name="status">
							<option value="en_apprentissage">En apprentissage</option>
							<option value="au_repertoire">Au répertoire</option>
							<option value="abandonne">Abandonné</option>
						</select>
					</label>
				</div>
				<details class="optional-details">
					<summary>Paroles et notes musicales <span class="optional-hint">(optionnel)</span></summary>
					<div class="fields-optional">
						<label class="form-label">
							Paroles
							<textarea class="form-input" name="lyrics" rows="6"></textarea>
						</label>
						<label class="form-label">
							Accords / infos musicales
							<textarea
								class="form-input"
								name="music_notes"
								rows="6"
								placeholder="Accords, structure, tempo, remarques..."
							></textarea>
						</label>
					</div>
				</details>
			</div>
			<div class="form-footer">
				<button type="submit" class="btn btn-primary">Ajouter</button>
			</div>
		</form>
	</section>

	<!-- Liste des morceaux -->
	<section class="songs-list">
		<h2>Morceaux ({data.songs.length})</h2>

		{#if data.songs.length === 0}
			<p class="empty">Aucun morceau pour l'instant.</p>
		{:else}
			<table class="data-table">
				<thead>
					<tr>
						<th>Titre</th>
						<th>Compositeur</th>
						<th>Tonalité</th>
						<th>Statut</th>
						<th>Prises</th>
						<th>Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each data.songs as song (song.id)}
						{@const isEditing = editingId === song.id}
						{@const hasError = form?.action === 'update' && form.id === song.id && form.error}
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
										<div class="fields-create">
											<label class="form-label">
												<span>Titre <span class="required">*</span></span>
												<input class="form-input" type="text" name="title" value={song.title} required />
											</label>
											<div class="fields-row">
												<label class="form-label">
													Compositeur
													<input class="form-input" type="text" name="composer" value={song.composer ?? ''} />
												</label>
												<label class="form-label tonalite">
													Tonalité
													<input class="form-input" type="text" name="key" value={song.key ?? ''} />
												</label>
												<label class="form-label statut">
													Statut
													<select class="form-input" name="status">
														{#each Object.entries(STATUS_LABELS) as [value, label]}
															<option {value} selected={song.status === value}>{label}</option>
														{/each}
													</select>
												</label>
											</div>
											<div class="fields-optional fields-optional-edit">
												<label class="form-label">
													Paroles
													<textarea class="form-input" name="lyrics" rows="6" value={song.lyrics ?? ''}></textarea>
												</label>
												<label class="form-label">
													Accords / infos musicales
													<textarea
														class="form-input"
														name="music_notes"
														rows="6"
														value={song.music_notes ?? ''}
													></textarea>
												</label>
											</div>
										</div>
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
								<td>{song.composer ?? '—'}</td>
								<td>{song.key ?? '—'}</td>
								<td>
									<span class="badge badge-{song.status}">
										{STATUS_LABELS[song.status]}
									</span>
								</td>
								<td class="center">{song.take_count}</td>
								<td class="actions-cell">
									<button class="btn btn-sm" onclick={() => (editingId = song.id)}>
										Modifier
									</button>

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

		{#if form?.action === 'delete' && form.error}
			<p class="message-error">{form.error}</p>
		{/if}
	</section>
</main>

<style>
	main {
		max-width: 900px;
		margin: 2rem auto;
		padding: 0 1rem;
	}

	h1 {
		font-size: var(--text-xl);
		margin-bottom: 2rem;
	}

	h2 {
		font-size: var(--text-lg);
		margin-bottom: 1rem;
	}

	section {
		margin-bottom: 3rem;
	}

	.add-form {
		margin-bottom: 3rem;
	}

	.fields-create {
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
		margin-bottom: 0.75rem;
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

	.fields-optional-edit {
		padding: 0;
	}

	textarea.form-input {
		resize: vertical;
		min-height: 7rem;
	}

	.form-footer {
		display: flex;
		justify-content: flex-end;
	}

	.required { color: var(--color-error); }

	.message-success {
		color: var(--color-repertoire-text, #166534);
		background: var(--color-repertoire-bg, #dcfce7);
		border-radius: var(--radius-md);
		padding: 0.4rem 0.75rem;
		font-size: var(--text-sm);
		margin-bottom: 0.5rem;
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
</style>
