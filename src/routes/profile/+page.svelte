<script lang="ts">
	import type { PageData, ActionData } from './$types'
	import { enhance } from '$app/forms'
	import { formatDateOnly } from '$lib/date'
	import Icon from '$lib/components/Icon.svelte'
	import Avatar from '$lib/components/Avatar.svelte'
	import InstrumentsInput from '$lib/components/InstrumentsInput.svelte'

	let { data, form }: { data: PageData; form: ActionData } = $props()

	const AVATAR_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif'
	const AVATAR_MAX_BYTES = 8 * 1024 * 1024

	let avatarBusy = $state(false)
	let avatarError = $state<string | null>(null)

	// Un seul groupe en édition à la fois ; le brouillon part de ce qui est enregistré.
	let editingInstrumentsFor = $state<number | null>(null)
	let instrumentsDraft = $state<string[]>([])

	function editInstruments(groupId: number) {
		instrumentsDraft = [...(data.instruments[groupId] ?? [])]
		editingInstrumentsFor = groupId
	}

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

<main class="page page-narrow">
	<nav class="breadcrumb">
		<a href="/">Tableau de bord</a> /
		<span>Mon profil</span>
	</nav>

	<h1>Mon profil</h1>

	<!-- Photo : elle part dès qu'elle est choisie, comme une pochette ; retirer ne demande
	     pas de confirmation, les initiales reviennent et la photo se redépose. -->
	<section class="section avatar-section">
		<Avatar userId={data.user?.id} name={data.user?.display_name ?? ''} version={data.user?.avatar_version} size="88px" full />
		<div class="avatar-body">
			<p class="avatar-name">{data.user?.display_name}</p>
			<div class="avatar-actions">
				<form
					method="POST"
					action="?/uploadAvatar"
					enctype="multipart/form-data"
					use:enhance={({ formData, cancel }) => {
						const file = formData.get('avatar')
						if (file instanceof File && file.size > AVATAR_MAX_BYTES) {
							avatarError = "L'image ne peut pas dépasser 8 Mo."
							cancel()
							return
						}
						avatarBusy = true
						avatarError = null
						return async ({ update }) => {
							avatarBusy = false
							await update()
						}
					}}
				>
					<label class="btn btn-secondary btn-sm" class:disabled={avatarBusy}>
						<Icon name="image" size="0.9rem" />
						{avatarBusy ? 'Envoi…' : data.user?.avatar_version ? 'Changer la photo' : 'Ajouter une photo'}
						<input
							type="file"
							name="avatar"
							accept={AVATAR_ACCEPT}
							class="file-input"
							disabled={avatarBusy}
							onchange={(e) => e.currentTarget.files?.length && e.currentTarget.form?.requestSubmit()}
						/>
					</label>
				</form>
				{#if data.user?.avatar_version}
					<form method="POST" action="?/removeAvatar" use:enhance>
						<button type="submit" class="btn-link btn-link-muted" disabled={avatarBusy}>Retirer</button>
					</form>
				{/if}
			</div>
			<p class="form-hint">
				Visible des membres de vos groupes. PNG, JPEG, WebP ou GIF, 8 Mo au plus, recadrée en
				carré au centre.
			</p>
			{#if avatarError}
				<p class="message-error">{avatarError}</p>
			{:else if form?.action === 'avatar' && form.error}
				<p class="message-error">{form.error}</p>
			{/if}
		</div>
	</section>

	<!-- Informations -->
	<section class="section">
		<div class="section-header">
			<h2 class="section-title">Informations</h2>
			{#if !editingProfile}
				<button
					type="button"
					class="btn btn-ghost btn-sm btn-icon"
					onclick={() => (editingProfile = true)}
					aria-label="Modifier les informations"
					title="Modifier les informations"
				>
					<Icon name="pencil" />
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
					<span class="form-hint">Si les informations nécessaires ne sont pas renseignées, le pseudo reste affiché.</span>
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

			<dt>Membre depuis</dt>
			<dd>{formatCreatedAt(data.created_at)}</dd>
		</dl>
	</section>

	<!-- Ce que le membre joue, groupe par groupe : on tient la basse dans l'un et on chante
	     dans l'autre. Les autres membres le lisent sur /group. -->
	<section class="section">
		<h2 class="section-title">Mes groupes</h2>
		{#if !data.user?.groups.length}
			<p class="muted">Aucun groupe.</p>
		{:else}
			<ul class="group-list">
				{#each data.user.groups as g (g.id)}
					{@const instruments = data.instruments[g.id] ?? []}
					<li class="group-item">
						<div class="group-head">
							<span class="group-name">{g.name}</span>
							<span class="badge badge-group-{g.role}">{GROUP_ROLE_LABELS[g.role] ?? g.role}</span>
							{#if editingInstrumentsFor !== g.id}
								<button
									type="button"
									class="btn btn-ghost btn-sm btn-icon group-edit"
									onclick={() => editInstruments(g.id)}
									aria-label="Modifier mes instruments dans {g.name}"
									title="Modifier mes instruments"
								>
									<Icon name="pencil" />
								</button>
							{/if}
						</div>

						{#if editingInstrumentsFor === g.id}
							<form
								method="POST"
								action="?/updateInstruments"
								class="instruments-form"
								use:enhance={() => {
									return async ({ result, update }) => {
										await update({ reset: false })
										if (result.type === 'success') editingInstrumentsFor = null
									}
								}}
							>
								<input type="hidden" name="group_id" value={g.id} />
								<InstrumentsInput bind:instruments={instrumentsDraft} label="Mes instruments dans {g.name}" />
								{#if form?.action === 'instruments' && form.groupId === g.id && form.error}
									<p class="message-error">{form.error}</p>
								{/if}
								<div class="form-actions">
									<button type="submit" class="btn btn-primary btn-sm">Enregistrer</button>
									<button type="button" class="btn btn-secondary btn-sm" onclick={() => (editingInstrumentsFor = null)}>
										Annuler
									</button>
								</div>
							</form>
						{:else if instruments.length}
							<p class="instruments">{instruments.join(' · ')}</p>
						{:else}
							<button type="button" class="btn-link instruments-empty" onclick={() => editInstruments(g.id)}>
								Dire ce que vous y jouez
							</button>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<!-- Mot de passe -->
	<section class="section">
		<h2 class="section-title">Mot de passe</h2>

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
	h1 { font-size: var(--text-xl); margin: 0 0 2rem; }

	/* Titre de section et son action sur une même ligne, sous un seul filet. */
	.section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		border-bottom: 1px solid var(--color-border-light);
		padding-bottom: 0.4rem;
		margin: 0 0 1rem;
	}
	.section-header .section-title {
		margin: 0;
		padding-bottom: 0;
		border-bottom: none;
	}

	.section .message-error,
	.section .message-success { margin: 0 0 0.75rem; }

	.info-list { margin: 0; }

	.avatar-section {
		display: flex;
		align-items: center;
		gap: 1.25rem;
	}
	.avatar-body { min-width: 0; display: flex; flex-direction: column; gap: 0.5rem; }
	.avatar-name { margin: 0; font-size: var(--text-lg); font-weight: 600; }
	.avatar-actions { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
	.avatar-body .form-hint,
	.avatar-body .message-error { margin: 0; }
	.avatar-actions label.disabled { opacity: 0.6; pointer-events: none; }
	/* Le champ de fichier, invisible, reçoit le focus clavier : le bouton en porte l'anneau. */
	.avatar-actions label:has(:focus-visible) { outline: 2px solid var(--color-accent); outline-offset: 2px; }

	/* Le sélecteur natif varie d'un navigateur à l'autre : le bouton le déclenche. */
	.file-input {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}

	.group-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}
	.group-item {
		padding: 0.75rem 0;
		border-bottom: 1px solid var(--color-border-light);
	}
	.group-item:first-child { padding-top: 0; }
	.group-item:last-child { border-bottom: none; }
	.group-head { display: flex; align-items: center; gap: 0.5rem; }
	.group-name { font-weight: 600; }
	.group-edit { margin-left: auto; }
	.instruments { margin: 0.35rem 0 0; color: var(--color-text-secondary); font-size: var(--text-sm); }
	.instruments-empty { margin-top: 0.35rem; font-size: var(--text-sm); }
	.instruments-form {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		max-width: 420px;
		margin-top: 0.6rem;
	}
	.instruments-form .message-error { margin: 0; }

	.muted { color: var(--color-text-muted); font-size: var(--text-sm); }

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
	.form-label .form-hint { display: block; margin-top: 0.35rem; font-weight: 400; }

	.required { color: var(--color-error); }

	.form-actions {
		display: flex;
		gap: 0.5rem;
	}
</style>
