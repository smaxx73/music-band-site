<script lang="ts">
	import type { PageData, ActionData } from './$types'
	import { enhance } from '$app/forms'
	import { formatDateOnly } from '$lib/date'

	let { data, form }: { data: PageData; form: ActionData } = $props()

	let changingPassword = $state(false)
	let passwordFormEl = $state<HTMLFormElement>()

	let editingProfile = $state(false)

	const DISPLAY_NAME_FORMAT_LABELS: Record<string, string> = {
		nickname: 'Pseudo',
		first_name: 'Prénom',
		first_name_last_initial: 'Prénom + initiale du nom',
		first_name_last_name: 'Prénom + nom'
	}

	const ROLE_LABELS: Record<string, string> = {
		user: 'Utilisateur',
		admin: 'Administrateur',
		superadmin: 'Super-admin'
	}

	const GROUP_ROLE_LABELS: Record<string, string> = {
		member: 'Membre',
		admin: 'Admin'
	}

	function formatCreatedAt(d: string | Date | null) {
		if (!d) return '—'
		return formatDateOnly(d, { day: 'numeric', month: 'long', year: 'numeric' })
	}
</script>

<svelte:head>
	<title>Mon profil</title>
</svelte:head>

<main>
	<nav class="breadcrumb">
		<a href="/">Tableau de bord</a> /
		<span>Mon profil</span>
	</nav>

	<h1>Mon profil</h1>

	<!-- Informations -->
	<section class="section">
		<div class="section-header">
			<h2>Informations</h2>
			{#if !editingProfile}
				<button
					type="button"
					class="btn-icon"
					onclick={() => (editingProfile = true)}
					aria-label="Modifier les informations"
					title="Modifier les informations"
				>
					✏️
				</button>
			{/if}
		</div>

		{#if form?.action === 'updateProfile' && form.error}
			<p class="message-error">{form.error}</p>
		{/if}
		{#if form?.action === 'updateProfile' && form.success}
			<p class="message-success">Informations mises à jour.</p>
		{/if}

		{#if !editingProfile}
			<dl class="info-list">
				<dt>Pseudo</dt>
				<dd>{data.user?.nickname}</dd>

				<dt>Prénom</dt>
				<dd>{data.user?.first_name || '—'}</dd>

				<dt>Nom</dt>
				<dd>{data.user?.last_name || '—'}</dd>

				<dt>Nom affiché sur les pages</dt>
				<dd>{DISPLAY_NAME_FORMAT_LABELS[data.user?.display_name_format ?? ''] ?? data.user?.display_name_format}</dd>
			</dl>
		{:else}
			<form
				method="POST"
				action="?/updateProfile"
				class="profile-form"
				use:enhance={() => {
					return async ({ result, update }) => {
						await update()
						if (result.type === 'success') {
							editingProfile = false
						}
					}
				}}
			>
				<label class="form-label">
					Pseudo <span class="required">*</span>
					<input class="form-input" type="text" name="nickname" required maxlength="50" value={data.user?.nickname ?? ''} autocomplete="username" />
				</label>
				<label class="form-label">
					Prénom
					<input class="form-input" type="text" name="first_name" maxlength="100" value={data.user?.first_name ?? ''} autocomplete="given-name" />
				</label>
				<label class="form-label">
					Nom
					<input class="form-input" type="text" name="last_name" maxlength="100" value={data.user?.last_name ?? ''} autocomplete="family-name" />
				</label>
				<label class="form-label">
					Nom affiché sur les pages
					<select class="form-input" name="display_name_format">
						<option value="nickname" selected={data.user?.display_name_format === 'nickname'}>Pseudo</option>
						<option value="first_name" selected={data.user?.display_name_format === 'first_name'}>Prénom</option>
						<option value="first_name_last_initial" selected={data.user?.display_name_format === 'first_name_last_initial'}>Prénom + initiale du nom</option>
						<option value="first_name_last_name" selected={data.user?.display_name_format === 'first_name_last_name'}>Prénom + nom</option>
					</select>
					<span class="field-hint">Si les informations nécessaires ne sont pas renseignées, le pseudo reste affiché.</span>
				</label>
				<div class="form-actions">
					<button type="submit" class="btn btn-primary">Enregistrer les informations</button>
					<button type="button" class="btn btn-ghost" onclick={() => (editingProfile = false)}>
						Annuler
					</button>
				</div>
			</form>
		{/if}

		<dl class="info-list account-info">
			<dt>Nom affiché actuel</dt>
			<dd>{data.user?.display_name}</dd>

			<dt>Rôle</dt>
			<dd>
				<span class="badge badge-{data.user?.role}">
					{ROLE_LABELS[data.user?.role ?? ''] ?? data.user?.role}
				</span>
			</dd>

			<dt>Groupes</dt>
			<dd>
				{#if !data.user?.groups.length}
					<span class="muted">Aucun groupe.</span>
				{:else}
					<ul class="group-list">
						{#each data.user.groups as g}
							<li>
								{g.name}
								<span class="muted">({GROUP_ROLE_LABELS[g.role] ?? g.role})</span>
							</li>
						{/each}
					</ul>
				{/if}
			</dd>

			<dt>Membre depuis</dt>
			<dd>{formatCreatedAt(data.created_at)}</dd>
		</dl>
	</section>

	<!-- Mot de passe -->
	<section class="section">
		<h2>Mot de passe</h2>

		{#if !changingPassword}
			<button class="btn btn-secondary" onclick={() => (changingPassword = true)}>
				Modifier le mot de passe
			</button>
		{:else}
			{#if form?.action === 'changePassword' && form.error}
				<p class="message-error">{form.error}</p>
			{/if}
			{#if form?.action === 'changePassword' && form.success}
				<p class="message-success">Mot de passe mis à jour.</p>
			{/if}
			<form
				method="POST"
				action="?/changePassword"
				bind:this={passwordFormEl}
				class="password-form"
				use:enhance={() => {
					return async ({ result, update }) => {
						await update()
						if (result.type === 'success') {
							passwordFormEl?.reset()
							changingPassword = false
						}
					}
				}}
			>
				<label class="form-label">
					Mot de passe actuel <span class="required">*</span>
					<input
						class="form-input"
						type="password"
						name="current_password"
						required
						autocomplete="current-password"
					/>
				</label>
				<label class="form-label">
					Nouveau mot de passe <span class="required">*</span>
					<input
						class="form-input"
						type="password"
						name="new_password"
						required
						minlength="6"
						autocomplete="new-password"
					/>
				</label>
				<label class="form-label">
					Confirmer le nouveau mot de passe <span class="required">*</span>
					<input
						class="form-input"
						type="password"
						name="confirm_password"
						required
						minlength="6"
						autocomplete="new-password"
					/>
				</label>
				<div class="form-actions">
					<button type="submit" class="btn btn-primary">Enregistrer</button>
					<button type="button" class="btn btn-ghost" onclick={() => (changingPassword = false)}>
						Annuler
					</button>
				</div>
			</form>
		{/if}
	</section>
</main>

<style>
	main {
		max-width: 640px;
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

	.section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		border-bottom: 1px solid #ebebeb;
		padding-bottom: 0.4rem;
		margin: 0 0 1rem;
	}
	.section-header h2 {
		margin: 0;
		padding-bottom: 0;
		border-bottom: none;
	}

	.btn-icon {
		background: none;
		border: none;
		cursor: pointer;
		font-size: 1rem;
		line-height: 1;
		padding: 0.2rem 0.35rem;
		border-radius: 4px;
	}
	.btn-icon:hover { background: #f0f0f0; }

	.info-list {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.6rem 1.5rem;
		margin: 0;
	}

	.info-list dt {
		font-weight: 600;
		color: #666;
		font-size: 0.85rem;
	}

	.info-list dd {
		margin: 0;
	}

	.group-list {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.muted { color: #999; font-size: 0.85rem; }

	.badge {
		display: inline-block;
		padding: 0.15rem 0.5rem;
		border-radius: 3px;
		font-size: 0.75rem;
		font-weight: 600;
	}

	.badge-superadmin { background: #fef3c7; color: #92400e; }
	.badge-admin { background: #e8f0fe; color: #1a56db; }
	.badge-user { background: #f0f0f0; color: #555; }

	.password-form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		max-width: 320px;
	}

	.profile-form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		max-width: 420px;
		margin-bottom: 1.5rem;
	}

	.account-info { margin-top: 1rem; }
	.field-hint { display: block; color: #777; font-size: 0.8rem; margin-top: 0.35rem; }

	.required { color: var(--color-error, #c0392b); }

	.form-actions {
		display: flex;
		gap: 0.5rem;
	}

	.message-error { color: #c0392b; font-size: 0.875rem; margin: 0 0 0.75rem; }
	.message-success { color: #166534; background: #dcfce7; border-radius: 4px; padding: 0.4rem 0.75rem; font-size: 0.875rem; margin: 0 0 0.75rem; }
</style>
