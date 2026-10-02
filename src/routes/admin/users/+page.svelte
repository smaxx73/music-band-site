<script lang="ts">
	import type { PageData, ActionData } from './$types'
	import { enhance } from '$app/forms'
	import { isSuperadmin } from '$lib/types'
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte'
	import { createSubmitConfirm } from '$lib/confirm-submit.svelte'

	let { data, form }: { data: PageData; form: ActionData } = $props()

	const ask = createSubmitConfirm()

	type User = {
		id: number
		nickname: string
		first_name: string | null
		last_name: string | null
		display_name: string
		role: string
		active: boolean
		created_at: string
	}

	let users = $derived(data.users as unknown as User[])
	let editingId = $state<number | null>(null)
	let resetId = $state<number | null>(null)

	// Un admin classique ne peut créer/gérer que des comptes 'user' — seul un super-admin
	// peut attribuer ou toucher un compte admin/superadmin.
	const actorIsSuperadmin = $derived(isSuperadmin(data.user?.role))

	function roleLabel(role: string) {
		if (role === 'superadmin') return 'Super-admin'
		if (role === 'admin') return 'Administrateur'
		return 'Utilisateur'
	}

	function canManage(role: string) {
		return actorIsSuperadmin || role === 'user'
	}
</script>

<svelte:head>
	<title>Gestion des utilisateurs — Admin</title>
</svelte:head>

<main class="page page-wide">
	<nav class="breadcrumb">
		<a href="/">Tableau de bord</a> /
		<a href="/admin">Administration</a> /
		<span>Utilisateurs</span>
	</nav>

	<h1>Gestion des utilisateurs</h1>

	<!-- Formulaire de création -->
	<section class="section">
		<h2 class="section-title">Ajouter un utilisateur</h2>

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
					Pseudo <span class="required">*</span>
					<input class="form-input" type="text" name="nickname" required maxlength="50" autocomplete="username" />
				</label>
				<label class="form-label">
					Mot de passe <span class="required">*</span>
					<input class="form-input" type="password" name="password" required minlength="6" autocomplete="new-password" />
				</label>
				<label class="form-label">
					Rôle
					<select class="form-input" name="role">
						<option value="user">Utilisateur</option>
						{#if actorIsSuperadmin}
							<option value="admin">Administrateur</option>
							<option value="superadmin">Super-admin</option>
						{/if}
					</select>
				</label>
			</div>
			<button type="submit" class="btn btn-primary">Créer</button>
		</form>
	</section>

	<!-- Liste des utilisateurs -->
	<section class="section">
		<h2 class="section-title">Utilisateurs ({users.length})</h2>

		{#if form?.action === 'delete' && form.error}
			<p class="message-error">{form.error}</p>
		{/if}

		{#if users.length === 0}
			<p class="empty">Aucun utilisateur.</p>
		{:else}
			<div class="table-scroll">
				<table class="data-table">
					<thead>
						<tr>
							<th>Pseudo</th>
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
												Pseudo
												<input class="form-input" type="text" value={user.nickname} disabled />
												</label>
												<label class="form-label">
													Rôle
													<select class="form-input" name="role">
														<option value="user" selected={user.role === 'user'}>Utilisateur</option>
														{#if actorIsSuperadmin}
															<option value="admin" selected={user.role === 'admin'}>Administrateur</option>
															<option value="superadmin" selected={user.role === 'superadmin'}>Super-admin</option>
														{/if}
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
									<td class="name">{user.nickname}{user.display_name !== user.nickname ? ` · ${user.display_name}` : ''}</td>
									<td>
										<span class="badge badge-{user.role}">
											{roleLabel(user.role)}
										</span>
									</td>
									<td>
										<span class="badge badge-status-{user.active ? 'active' : 'inactive'}">
											{user.active ? 'Actif' : 'Inactif'}
										</span>
									</td>
									<td class="actions-cell">
										{#if canManage(user.role)}
											<button class="btn btn-secondary btn-sm" onclick={() => (editingId = user.id)}>
												Modifier
											</button>
											<button class="btn btn-secondary btn-sm" onclick={() => (resetId = user.id)}>
												Mot de passe
											</button>
											<form
												method="POST"
												action="?/delete"
												use:enhance={({ formElement, cancel }) => {
													ask.intercept(formElement, cancel, {
														level: 'danger',
														title: 'Supprimer ce compte ?',
														message: `Le compte « ${user.nickname} » sera supprimé avec son espace perso, fichiers compris, et les publications qui en montraient les enregistrements. Ses sessions, prises, commentaires et feuilles de répétition restent dans les groupes, sans compte rattaché. Pour seulement couper l'accès, passez-le en « Inactif ». Cette action est irréversible.`,
														confirmLabel: 'Supprimer le compte'
													})
												}}
											>
												<input type="hidden" name="id" value={user.id} />
												<button type="submit" class="btn btn-sm btn-danger">Supprimer</button>
											</form>
										{:else}
											<span class="muted-note">Réservé au super-admin</span>
										{/if}
									</td>
								</tr>
							{/if}
						{/each}
					</tbody>
				</table>
			</div>
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

<style>
	h1 { font-size: var(--text-xl); margin: 0 0 2rem; }

	.section .message-error { margin: 0 0 0.5rem; }

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

	tr.inactive td { opacity: 0.5; }

	.name { font-weight: 600; }

	.editing-row td {
		background: var(--color-bg-subtle);
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

	.badge-status-active { background: var(--color-success-bg); color: var(--color-success-text); }
	.badge-status-inactive { background: var(--color-red-light); color: var(--color-red); }

	.muted-note { color: var(--color-text-muted); font-style: italic; font-size: var(--text-xs); }

	/* Sous 640 px le tableau devient une pile de cartes (voir app.css) : les trois
	   champs du formulaire d'édition passent aussi en colonne. */
	@media (max-width: 640px) {
		.fields { grid-template-columns: 1fr; }

		td.name { flex: 1 1 100%; font-size: var(--text-base); }

		td.actions-cell {
			flex: 1 1 100%;
			flex-wrap: wrap;
			margin-top: 0.35rem;
		}

		.editing-row td { flex: 1 1 100%; padding: 0.75rem; }
	}
</style>
