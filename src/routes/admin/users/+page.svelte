<script lang="ts">
	import type { PageData, ActionData } from './$types'
	import { enhance } from '$app/forms'

	let { data, form }: { data: PageData; form: ActionData } = $props()

	type User = { id: number; name: string; role: string; active: boolean; created_at: string }

	let users = $state(data.users as unknown as User[])
	let editingId = $state<number | null>(null)
	let resetId = $state<number | null>(null)
</script>

<svelte:head>
	<title>Gestion des utilisateurs — Admin</title>
</svelte:head>

<main>
	<nav class="breadcrumb">
		<a href="/">Tableau de bord</a> /
		<a href="/admin">Administration</a> /
		<span>Utilisateurs</span>
	</nav>

	<h1>Gestion des utilisateurs</h1>

	<!-- Formulaire de création -->
	<section class="section">
		<h2>Ajouter un utilisateur</h2>

		{#if form?.action === 'create' && form.error}
			<p class="message-error">{form.error}</p>
		{/if}

		<form
			method="POST"
			action="?/create"
			use:enhance={() => {
				return ({ result, update }) => {
					if (result.type === 'success' || result.type === 'redirect') {
						update()
					} else {
						update()
					}
				}
			}}
		>
			<div class="fields">
				<label class="form-label">
					Prénom <span class="required">*</span>
					<input class="form-input" type="text" name="name" required autocomplete="off" />
				</label>
				<label class="form-label">
					Mot de passe <span class="required">*</span>
					<input class="form-input" type="password" name="password" required minlength="6" autocomplete="new-password" />
				</label>
				<label class="form-label">
					Rôle
					<select class="form-input" name="role">
						<option value="user">Utilisateur</option>
						<option value="admin">Administrateur</option>
					</select>
				</label>
			</div>
			<button type="submit" class="btn btn-primary">Créer</button>
		</form>
	</section>

	<!-- Liste des utilisateurs -->
	<section class="section">
		<h2>Utilisateurs ({users.length})</h2>

		{#if form?.action === 'delete' && form.error}
			<p class="message-error">{form.error}</p>
		{/if}

		{#if users.length === 0}
			<p class="empty">Aucun utilisateur.</p>
		{:else}
			<table class="data-table">
				<thead>
					<tr>
						<th>Nom</th>
						<th>Rôle</th>
						<th>Statut</th>
						<th>Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each users as user (user.id)}
						{@const isEditing = editingId === user.id}
						{@const isResetting = resetId === user.id}
						{@const updateError = form?.action === 'update' && form.id === user.id ? form.error : null}
						{@const resetError = form?.action === 'resetPassword' && form.id === user.id ? form.error : null}

						{#if isEditing}
							<tr class="editing-row">
								<td colspan="4">
									{#if updateError}
										<p class="message-error">{updateError}</p>
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
										<input type="hidden" name="id" value={user.id} />
										<div class="fields">
											<label class="form-label">
												Nom
												<input class="form-input" type="text" value={user.name} disabled />
											</label>
											<label class="form-label">
												Rôle
												<select class="form-input" name="role">
													<option value="user" selected={user.role === 'user'}>Utilisateur</option>
													<option value="admin" selected={user.role === 'admin'}>Administrateur</option>
												</select>
											</label>
											<label class="form-label">
												Statut
												<select class="form-input" name="active">
													<option value="true" selected={user.active}>Actif</option>
													<option value="false" selected={!user.active}>Inactif</option>
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
						{:else if isResetting}
							<tr class="editing-row">
								<td colspan="4">
									{#if resetError}
										<p class="message-error">{resetError}</p>
									{/if}
									<form
										method="POST"
										action="?/resetPassword"
										class="inline-edit-form"
										use:enhance={() => {
											return ({ result }) => {
												if (result.type === 'success' || result.type === 'redirect') {
													resetId = null
												}
											}
										}}
									>
										<input type="hidden" name="id" value={user.id} />
										<div class="fields fields-narrow">
											<label class="form-label">
												Nouveau mot de passe <span class="required">*</span>
												<input
													class="form-input"
													type="password"
													name="password"
													required
													minlength="6"
													autocomplete="new-password"
												/>
											</label>
										</div>
										<div class="inline-actions">
											<button type="submit" class="btn btn-primary">Réinitialiser</button>
											<button type="button" class="btn btn-ghost" onclick={() => (resetId = null)}>
												Annuler
											</button>
										</div>
									</form>
								</td>
							</tr>
						{:else}
							<tr class:inactive={!user.active}>
								<td class="name">{user.name}</td>
								<td>
									<span class="badge badge-{user.role}">
										{user.role === 'admin' ? 'Administrateur' : 'Utilisateur'}
									</span>
								</td>
								<td>
									<span class="badge badge-status-{user.active ? 'active' : 'inactive'}">
										{user.active ? 'Actif' : 'Inactif'}
									</span>
								</td>
								<td class="actions-cell">
									<button class="btn btn-sm" onclick={() => (editingId = user.id)}>
										Modifier
									</button>
									<button class="btn btn-sm" onclick={() => (resetId = user.id)}>
										Mot de passe
									</button>
									<form
										method="POST"
										action="?/delete"
										use:enhance
										onsubmit={(e) => {
											if (!confirm(`Supprimer "${user.name}" ?`)) e.preventDefault()
										}}
									>
										<input type="hidden" name="id" value={user.id} />
										<button type="submit" class="btn btn-sm btn-danger">Supprimer</button>
									</form>
								</td>
							</tr>
						{/if}
					{/each}
				</tbody>
			</table>
		{/if}
	</section>
</main>

<style>
	main {
		max-width: 820px;
		margin: 2rem auto;
		padding: 0 1rem;
	}

	.breadcrumb {
		font-size: 0.85rem;
		color: #888;
		margin-bottom: 1.25rem;
	}

	.breadcrumb a { color: inherit; text-decoration: none; }
	.breadcrumb a:hover { text-decoration: underline; }

	h1 { font-size: var(--text-xl); margin-bottom: 2rem; }

	h2 {
		font-size: 1rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: #888;
		margin: 0 0 1rem;
		padding-bottom: 0.4rem;
		border-bottom: 1px solid #ebebeb;
	}

	.section { margin-bottom: 2.5rem; }

	.fields {
		display: grid;
		grid-template-columns: 2fr 2fr 1fr;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
	}

	.fields-narrow {
		grid-template-columns: 2fr;
	}

	.required { color: var(--color-error); }

	table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }

	th {
		text-align: left;
		padding: 0.4rem 0.75rem;
		border-bottom: 2px solid #e0e0e0;
		font-size: 0.72rem;
		text-transform: uppercase;
		color: #666;
	}

	td {
		padding: 0.55rem 0.75rem;
		border-bottom: 1px solid #f0f0f0;
		vertical-align: middle;
	}

	tr.inactive td { opacity: 0.5; }

	.name { font-weight: 600; }

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

	.badge {
		display: inline-block;
		padding: 0.15rem 0.5rem;
		border-radius: 3px;
		font-size: 0.75rem;
		font-weight: 600;
	}

	.badge-admin { background: #e8f0fe; color: #1a56db; }
	.badge-user { background: #f0f0f0; color: #555; }
	.badge-status-active { background: #d1fae5; color: #065f46; }
	.badge-status-inactive { background: #fee2e2; color: #991b1b; }

	.empty { color: #aaa; font-style: italic; font-size: 0.9rem; }
	.message-error { color: #c0392b; font-size: 0.875rem; margin: 0 0 0.5rem; }
</style>
