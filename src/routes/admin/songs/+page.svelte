<script lang="ts">
	import type { PageData, ActionData } from './$types'
	import { enhance } from '$app/forms'

	let { data, form }: { data: PageData; form: ActionData } = $props()

	let editingId = $state<number | null>(null)

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
	<h1>Référentiel de morceaux</h1>

	<!-- Formulaire d'ajout -->
	<section class="add-form form-section">
		<h2>Ajouter un morceau</h2>
		{#if form?.action === 'create' && form.error}
			<p class="message-error">{form.error}</p>
		{/if}
		<form method="POST" action="?/create" use:enhance>
			<div class="fields">
				<label class="form-label">
					Titre <span class="required">*</span>
					<input class="form-input" type="text" name="title" required />
				</label>
				<label class="form-label">
					Compositeur
					<input class="form-input" type="text" name="composer" />
				</label>
				<label class="form-label">
					Tonalité
					<input class="form-input" type="text" name="key" placeholder="ex : Dm, Bb" />
				</label>
				<label class="form-label">
					Statut
					<select class="form-input" name="status">
						<option value="en_apprentissage">En apprentissage</option>
						<option value="au_repertoire">Au répertoire</option>
						<option value="abandonne">Abandonné</option>
					</select>
				</label>
				<label class="form-label wide">
					Paroles
					<textarea class="form-input" name="lyrics" rows="6"></textarea>
				</label>
				<label class="form-label wide">
					Accords / infos musicales
					<textarea
						class="form-input"
						name="music_notes"
						rows="6"
						placeholder="Accords, structure, tempo, remarques..."
					></textarea>
				</label>
			</div>
			<button type="submit" class="btn btn-primary">Ajouter</button>
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
										<div class="fields">
											<label class="form-label">
												Titre <span class="required">*</span>
												<input class="form-input" type="text" name="title" value={song.title} required />
											</label>
											<label class="form-label">
												Compositeur
												<input class="form-input" type="text" name="composer" value={song.composer ?? ''} />
											</label>
											<label class="form-label">
												Tonalité
												<input class="form-input" type="text" name="key" value={song.key ?? ''} />
											</label>
											<label class="form-label">
												Statut
												<select class="form-input" name="status">
													{#each Object.entries(STATUS_LABELS) as [value, label]}
														<option {value} selected={song.status === value}>{label}</option>
													{/each}
												</select>
											</label>
											<label class="form-label wide">
												Paroles
												<textarea class="form-input" name="lyrics" rows="6" value={song.lyrics ?? ''}></textarea>
											</label>
											<label class="form-label wide">
												Accords / infos musicales
												<textarea
													class="form-input"
													name="music_notes"
													rows="6"
													value={song.music_notes ?? ''}
												></textarea>
											</label>
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
								<td class="title">{song.title}</td>
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

	.fields {
		display: grid;
		grid-template-columns: 2fr 1.5fr 1fr 1.5fr;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
	}

	.fields .wide {
		grid-column: span 2;
	}

	textarea.form-input {
		resize: vertical;
		min-height: 8rem;
	}

	.required { color: var(--color-error); }

	td.center { text-align: center; }
	td.title { font-weight: 600; }

	tr.abandoned td { opacity: 0.5; }

	.editing-row td {
		background: #fffbe6;
		padding: 1rem 0.75rem;
	}

	.inline-edit-form .fields { margin-bottom: 0.5rem; }

	.inline-actions { display: flex; gap: 0.5rem; }

	.actions-cell {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.actions-cell form { margin: 0; }
</style>
