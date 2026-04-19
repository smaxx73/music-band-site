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
	<section class="add-form">
		<h2>Ajouter un morceau</h2>
		{#if form?.action === 'create' && form.error}
			<p class="error">{form.error}</p>
		{/if}
		<form method="POST" action="?/create" use:enhance>
			<div class="fields">
				<label>
					Titre <span class="required">*</span>
					<input type="text" name="title" required />
				</label>
				<label>
					Compositeur
					<input type="text" name="composer" />
				</label>
				<label>
					Tonalité
					<input type="text" name="key" placeholder="ex : Dm, Bb" />
				</label>
				<label>
					Statut
					<select name="status">
						<option value="en_apprentissage">En apprentissage</option>
						<option value="au_repertoire">Au répertoire</option>
						<option value="abandonne">Abandonné</option>
					</select>
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
			<table>
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
										<p class="error">{form?.error}</p>
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
											<label>
												Titre <span class="required">*</span>
												<input type="text" name="title" value={song.title} required />
											</label>
											<label>
												Compositeur
												<input type="text" name="composer" value={song.composer ?? ''} />
											</label>
											<label>
												Tonalité
												<input type="text" name="key" value={song.key ?? ''} />
											</label>
											<label>
												Statut
												<select name="status">
													{#each Object.entries(STATUS_LABELS) as [value, label]}
														<option {value} selected={song.status === value}>{label}</option>
													{/each}
												</select>
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
			<p class="error">{form.error}</p>
		{/if}
	</section>
</main>

<style>
	main {
		max-width: 900px;
		margin: 2rem auto;
		padding: 0 1rem;
		font-family: sans-serif;
	}

	h1 {
		font-size: 1.5rem;
		margin-bottom: 2rem;
	}

	h2 {
		font-size: 1.1rem;
		margin-bottom: 1rem;
	}

	section {
		margin-bottom: 3rem;
	}

	.add-form {
		background: #f8f8f8;
		border: 1px solid #e0e0e0;
		border-radius: 6px;
		padding: 1.25rem;
	}

	.fields {
		display: grid;
		grid-template-columns: 2fr 1.5fr 1fr 1.5fr;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.8rem;
		font-weight: 600;
	}

	input,
	select {
		padding: 0.4rem 0.6rem;
		border: 1px solid #ccc;
		border-radius: 4px;
		font-size: 0.875rem;
	}

	.required {
		color: #c0392b;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.875rem;
	}

	th {
		text-align: left;
		padding: 0.5rem 0.75rem;
		border-bottom: 2px solid #e0e0e0;
		font-size: 0.75rem;
		text-transform: uppercase;
		color: #666;
	}

	td {
		padding: 0.6rem 0.75rem;
		border-bottom: 1px solid #f0f0f0;
		vertical-align: middle;
	}

	td.center {
		text-align: center;
	}

	td.title {
		font-weight: 600;
	}

	tr.abandoned td {
		opacity: 0.5;
	}

	.editing-row td {
		background: #fffbe6;
		padding: 1rem 0.75rem;
	}

	.inline-edit-form .fields {
		margin-bottom: 0.5rem;
	}

	.inline-actions {
		display: flex;
		gap: 0.5rem;
	}

	.actions-cell {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.actions-cell form {
		margin: 0;
	}

	.badge {
		display: inline-block;
		padding: 0.2rem 0.5rem;
		border-radius: 3px;
		font-size: 0.75rem;
		font-weight: 600;
	}

	.badge-en_apprentissage {
		background: #dbeafe;
		color: #1e40af;
	}

	.badge-au_repertoire {
		background: #dcfce7;
		color: #166534;
	}

	.badge-abandonne {
		background: #f3f4f6;
		color: #6b7280;
	}

	.btn {
		padding: 0.4rem 0.8rem;
		border: 1px solid #ccc;
		border-radius: 4px;
		font-size: 0.875rem;
		cursor: pointer;
		background: white;
	}

	.btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.btn-primary {
		background: #1a1a1a;
		color: white;
		border-color: #1a1a1a;
	}

	.btn-primary:hover:not(:disabled) {
		background: #333;
	}

	.btn-danger {
		color: #c0392b;
		border-color: #e5bebe;
	}

	.btn-danger:hover:not(:disabled) {
		background: #fef2f2;
	}

	.btn-ghost {
		border-color: transparent;
		color: #555;
	}

	.btn-ghost:hover {
		background: #f0f0f0;
	}

	.btn-sm {
		padding: 0.25rem 0.6rem;
		font-size: 0.8rem;
	}

	.error {
		color: #c0392b;
		font-size: 0.875rem;
		margin: 0 0 0.5rem;
	}

	.empty {
		color: #888;
		font-style: italic;
	}
</style>
