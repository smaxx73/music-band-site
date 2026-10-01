<script lang="ts">
	import type { PageData, ActionData } from './$types'
	import { enhance } from '$app/forms'
	import { formatDateOnly } from '$lib/date'
	import {
		formatBytes,
		GROUP_LINK_LABELS,
		groupLogoUrl,
		isAdmin,
		type GroupLinkField
	} from '$lib/types'
	import Icon from '$lib/components/Icon.svelte'
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte'
	import { createSubmitConfirm } from '$lib/confirm-submit.svelte'
	import { groupRoleChangeRequest, removeMemberRequest } from '$lib/group-roles'
	import GroupPlaces from '$lib/components/GroupPlaces.svelte'
	import type { GroupPlace } from '$lib/places'

	let { data, form }: { data: PageData; form: ActionData } = $props()

	const ask = createSubmitConfirm()

	const ROLE_LABELS: Record<string, string> = {
		user: 'Utilisateur',
		admin: 'Administrateur',
		superadmin: 'Super-admin'
	}

	const GROUP_ROLE_LABELS: Record<string, string> = {
		member: 'Membre',
		admin: 'Admin'
	}

	let editingName = $state(false)
	let newName = $state('')
	let busyMemberId = $state<number | null>(null)
	let logoError = $state<string | null>(null)
	let uploadingLogo = $state(false)

	const LINK_FIELDS = Object.keys(GROUP_LINK_LABELS) as GroupLinkField[]
	const LINK_PLACEHOLDERS: Record<GroupLinkField, string> = {
		youtube_url: 'youtube.com/@mongroupe',
		facebook_url: 'facebook.com/mongroupe',
		instagram_url: 'instagram.com/mongroupe'
	}
	const LOGO_MAX_BYTES = 2 * 1024 * 1024

	const groupLinks = $derived(
		data.group ? LINK_FIELDS.filter((f) => data.group[f]).map((f) => ({ field: f, url: data.group[f] as string })) : []
	)

	// Refus immédiat d'un fichier trop lourd, plutôt qu'après l'avoir envoyé :
	// le serveur applique de toute façon la même limite.
	function checkLogoSize(e: Event) {
		const input = e.currentTarget as HTMLInputElement
		const file = input.files?.[0]
		if (file && file.size > LOGO_MAX_BYTES) {
			logoError = 'Le logo ne peut pas dépasser 2 Mo.'
			input.value = ''
		} else {
			logoError = null
		}
	}

	function linkValue(field: GroupLinkField): string {
		const submitted = form?.action === 'updateLinks' && form && 'links' in form
			? (form.links as Record<string, string> | undefined)?.[field]
			: undefined
		return submitted ?? (data.group?.[field] as string | null) ?? ''
	}

	function formatCreatedAt(d: string | Date | null | undefined) {
		if (!d) return '—'
		return formatDateOnly(d, { day: 'numeric', month: 'long', year: 'numeric' })
	}

</script>

<svelte:head>
	<title>{data.group ? data.group.name : 'Mon groupe'}</title>
</svelte:head>

<main class="page">
	<nav class="breadcrumb">
		<a href="/">Tableau de bord</a> /
		<span>Mon groupe</span>
	</nav>

	{#if !data.group}
		<h1>Mon groupe</h1>
		<p class="empty">Vous n'appartenez à aucun groupe actif.</p>
	{:else}
		{#if data.canManage && editingName}
			<form
				method="POST"
				action="?/rename"
				use:enhance={() => ({ update }) => { editingName = false; return update() }}
				class="rename-form"
			>
				<input name="name" type="text" bind:value={newName} class="form-input input-title" aria-label="Nom du groupe" required />
				<button type="submit" class="btn btn-primary">Enregistrer</button>
				<button type="button" class="btn btn-secondary" onclick={() => (editingName = false)}>Annuler</button>
			</form>
		{:else}
			<h1 class="group-title">
				{#if data.group.logo_version}
					<img
						src={groupLogoUrl(data.group.id, data.group.logo_version)}
						alt="Logo de {data.group.name}"
						class="group-logo"
					/>
				{/if}
				{data.group.name}
				{#if data.canManage}
					<button
						class="btn btn-ghost btn-sm"
						title="Renommer le groupe"
						onclick={() => { newName = data.group.name as string; editingName = true }}
					><Icon name="pencil" size="0.85rem" label="Renommer le groupe" /></button>
				{/if}
			</h1>
		{/if}
		{#if form?.action === 'rename' && form?.error}
			<p class="message-error">{form.error}</p>
		{/if}

		<!-- Informations -->
		<section class="section">
			<h2 class="section-title">Informations</h2>
			<dl class="info-list">
				<dt>Créé le</dt>
				<dd>{formatCreatedAt(data.group.created_at)}</dd>

				<dt>Membres</dt>
				<dd>{data.group.member_count}</dd>

				<dt>Morceaux</dt>
				<dd>{data.group.song_count}</dd>

				<dt>Sessions</dt>
				<dd>{data.group.session_count}</dd>

				<dt>Playlists</dt>
				<dd>{data.group.playlist_count}</dd>

				<dt>Prises</dt>
				<dd>
					{data.group.recording_count}
					{#if data.group.video_only_count > 0}
						<span class="muted">(dont {data.group.video_only_count} vidéo seule)</span>
					{/if}
				</dd>

				<dt>Espace disque</dt>
				<dd title="{data.audioBytes.toLocaleString('fr-FR')} octets">{formatBytes(data.audioBytes)}</dd>

				{#if groupLinks.length > 0}
					<dt>Réseaux</dt>
					<dd class="links">
						{#each groupLinks as link}
							<a href={link.url} target="_blank" rel="noopener noreferrer" class="social-link social-{link.field}">
								{GROUP_LINK_LABELS[link.field]} ↗
							</a>
						{/each}
					</dd>
				{/if}
			</dl>

			{#if isAdmin(data.user?.role)}
				<p class="admin-link">
					<a href="/admin/groups/{data.group.id}">Gérer ce groupe →</a>
				</p>
			{/if}
		</section>

		<!-- Membres -->
		<section class="section">
			<h2 class="section-title">Membres ({data.members.length})</h2>

			{#if data.members.length === 0}
				<p class="empty">Aucun membre.</p>
			{:else}
				<div class="table-scroll">
					<table class="data-table">
						<thead>
							<tr>
								<th>Nom</th>
								<th>Rôle dans le groupe</th>
								{#if data.canSeeGlobalRole}<th>Rôle global</th>{/if}
								{#if data.canManage}<th></th>{/if}
							</tr>
						</thead>
						<tbody>
							{#each data.members as m}
								<tr>
									<td class="name">{m.display_name}</td>
									<td data-label="Groupe">
										{#if data.canAssignAdmin}
											<!-- Seul le superadmin peut attribuer ou retirer le rôle d'admin de groupe. -->
											<form
												method="POST"
												action="?/updateRole"
												use:enhance={({ formElement, cancel }) => {
													ask.intercept(formElement, cancel, groupRoleChangeRequest(formElement, m.display_name, m.group_role))
												}}
											>
												<input type="hidden" name="user_id" value={m.id} />
												<select
													name="role"
													class="form-input role-select"
													aria-label="Rôle de {m.display_name} dans le groupe"
													onchange={(e) => e.currentTarget.form?.requestSubmit()}
												>
													<option value="member" selected={m.group_role === 'member'}>Membre</option>
													<option value="admin" selected={m.group_role === 'admin'}>Admin</option>
												</select>
											</form>
										{:else}
											<span class="badge badge-group-{m.group_role}">
												{GROUP_ROLE_LABELS[m.group_role] ?? m.group_role}
											</span>
										{/if}
									</td>
									{#if data.canSeeGlobalRole}
										<td data-label="Global">
											<span class="badge badge-{m.global_role}">
												{ROLE_LABELS[m.global_role] ?? m.global_role}
											</span>
										</td>
									{/if}
									{#if data.canManage}
										<td class="actions">
											<!-- Retirer un admin de groupe revient à lui retirer son rôle :
											     le serveur le réserve au superadmin, l'écran suit la même règle. -->
											{#if m.group_role !== 'admin' || data.canAssignAdmin}
												<form
													method="POST"
													action="?/removeMember"
													use:enhance={({ formElement, cancel }) => {
														if (ask.intercept(formElement, cancel, removeMemberRequest(m.display_name))) return
														busyMemberId = m.id
														return ({ update }) => { busyMemberId = null; return update() }
													}}
												>
													<input type="hidden" name="user_id" value={m.id} />
													<button type="submit" class="btn btn-danger btn-sm" disabled={busyMemberId === m.id}>
														{busyMemberId === m.id ? '…' : 'Retirer'}
													</button>
												</form>
											{/if}
										</td>
									{/if}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}

			{#if form?.error && (form?.action === 'removeMember' || form?.action === 'updateRole')}
				<p class="message-error">{form.error}</p>
			{/if}
		</section>

		<!-- Lieux proposés à la saisie du lieu d'une session : visibles de tous les membres,
		     gérés par l'admin du groupe. -->
		<section class="section">
			<h2 class="section-title">Lieux ({data.places.length})</h2>
			<GroupPlaces
				places={data.places as GroupPlace[]}
				canManage={data.canManage}
				error={form?.error && ['addPlace', 'updatePlace', 'removePlace'].includes(form.action as string)
					? (form.error as string)
					: null}
			/>
		</section>

		{#if data.canManage}
			<!-- Ajout par pseudo exact : un admin de groupe n'a pas à voir l'annuaire
			     des comptes des autres groupes de la plateforme. -->
			<section class="section">
				<h2 class="section-title">Ajouter un membre</h2>
				<form method="POST" action="?/addMember" use:enhance class="add-form">
					<input
						name="nickname"
						type="text"
						class="form-input"
						placeholder="Pseudo du membre"
						aria-label="Pseudo du membre à ajouter"
						autocomplete="off"
						required
					/>
					<button type="submit" class="btn btn-primary">Ajouter</button>
				</form>
				<p class="form-hint">Le membre est ajouté avec le rôle « Membre ».</p>
				{#if form?.action === 'addMember' && form?.error}
					<p class="message-error">{form.error}</p>
				{:else if form?.action === 'addMember' && form?.added}
					<p class="message-ok">{form.added} a rejoint le groupe.</p>
				{/if}
			</section>

			<section class="section">
				<h2 class="section-title">Logo</h2>
				<div class="logo-editor">
					{#if data.group.logo_version}
						<img
							src={groupLogoUrl(data.group.id, data.group.logo_version)}
							alt="Logo actuel"
							class="logo-preview"
						/>
					{:else}
						<div class="logo-preview logo-empty">Aucun logo</div>
					{/if}

					<div class="logo-actions">
						<form
							method="POST"
							action="?/uploadLogo"
							enctype="multipart/form-data"
							class="add-form"
							use:enhance={() => {
								uploadingLogo = true
								return ({ update }) => { uploadingLogo = false; return update() }
							}}
						>
							<input
								name="logo"
								type="file"
								accept="image/png,image/jpeg,image/webp,image/gif"
								aria-label="Image du logo"
								class="input-file"
								onchange={checkLogoSize}
								required
							/>
							<button type="submit" class="btn btn-primary" disabled={uploadingLogo}>
								{uploadingLogo ? 'Envoi…' : data.group.logo_version ? 'Remplacer' : 'Envoyer'}
							</button>
						</form>
						<p class="form-hint">PNG, JPEG, WebP ou GIF, 2 Mo maximum. Une image carrée rend le mieux.</p>

						{#if data.group.logo_version}
							<form
								method="POST"
								action="?/removeLogo"
								use:enhance={({ formElement, cancel }) => {
									ask.intercept(formElement, cancel, {
										level: 'warning',
										title: 'Retirer le logo ?',
										message: "Le groupe n'aura plus de logo, ni dans la barre du haut ni dans l'aperçu des liens d'écoute. Un nouveau pourra être envoyé.",
										confirmLabel: 'Retirer le logo'
									})
								}}
							>
								<button type="submit" class="btn btn-danger btn-sm">Retirer le logo</button>
							</form>
						{/if}
					</div>
				</div>
				{#if logoError}
					<p class="message-error">{logoError}</p>
				{:else if (form?.action === 'uploadLogo' || form?.action === 'removeLogo') && form?.error}
					<p class="message-error">{form.error}</p>
				{/if}
			</section>

			<section class="section">
				<h2 class="section-title">Réseaux</h2>
				<form
					method="POST"
					action="?/updateLinks"
					class="links-form"
					use:enhance={() => ({ update }) => update({ reset: false })}
				>
					{#each LINK_FIELDS as field}
						<label for="link-{field}">{GROUP_LINK_LABELS[field]}</label>
						<input
							id="link-{field}"
							name={field}
							type="text"
							inputmode="url"
							class="form-input"
							placeholder={LINK_PLACEHOLDERS[field]}
							value={linkValue(field)}
							autocomplete="off"
						/>
					{/each}
					<div class="links-submit">
						<button type="submit" class="btn btn-primary">Enregistrer</button>
					</div>
				</form>
				<p class="form-hint">Laisser un champ vide retire le lien.</p>
				{#if form?.action === 'updateLinks' && form?.error}
					<p class="message-error">{form.error}</p>
				{:else if form?.action === 'updateLinks' && form && 'saved' in form}
					<p class="message-ok">Liens enregistrés.</p>
				{/if}
			</section>
		{/if}
	{/if}

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

	.section > .message-error,
	.section > .message-ok { margin-top: 0.5rem; }

	.info-list .muted { color: var(--color-text-secondary); font-size: var(--text-sm); }

	.group-title {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	/* Fond blanc : un logo à fond transparent s'y lit comme dans l'aperçu d'un lien. */
	.group-logo,
	.logo-preview {
		border-radius: 50%;
		object-fit: cover;
		border: 1px solid var(--color-border-light);
		background: #fff;
		flex-shrink: 0;
	}

	.group-logo { width: 56px; height: 56px; }
	.logo-preview { width: 96px; height: 96px; }

	.links { display: flex; flex-wrap: wrap; gap: 0.4rem; }

	.social-link {
		display: inline-block;
		padding: 0.15rem 0.6rem;
		border-radius: var(--radius-pill);
		font-size: var(--text-xs);
		font-weight: 600;
		text-decoration: none;
		border: 1px solid currentColor;
	}
	.social-link:hover { text-decoration: underline; }
	/* Couleurs des marques elles-mêmes : c'est à elles qu'on reconnaît le réseau. */
	.social-youtube_url { color: #c4302b; }
	.social-facebook_url { color: #1877f2; }
	.social-instagram_url { color: #c13584; }

	.logo-editor {
		display: flex;
		gap: 1.25rem;
		align-items: flex-start;
		flex-wrap: wrap;
	}

	.logo-empty {
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--color-text-muted);
		font-size: var(--text-xs);
		border-style: dashed;
	}

	.logo-actions {
		flex: 1 1 16rem;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.logo-actions .form-hint { margin: 0; }

	.input-file {
		flex: 1 1 12rem;
		min-width: 0;
		font-size: var(--text-sm);
	}

	.links-form {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.5rem 1rem;
		align-items: center;
	}
	.links-form label { font-weight: 600; color: var(--color-text-secondary); font-size: var(--text-sm); }
	.links-submit { grid-column: 2; }

	@media (max-width: 480px) {
		.links-form { grid-template-columns: 1fr; }
		.links-submit { grid-column: 1; }
	}

	.admin-link { font-size: var(--text-sm); }
	.admin-link a { color: inherit; }

	.name { font-weight: 600; }

	.rename-form {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		margin-bottom: 2rem;
		flex-wrap: wrap;
	}

	.input-title {
		flex: 1 1 12rem;
		min-width: 0;
		font-size: var(--text-xl);
		font-weight: 700;
	}

	.add-form { display: flex; gap: 0.5rem; flex-wrap: wrap; }
	.add-form .form-input { flex: 1 1 12rem; min-width: 0; }

	.role-select { padding: 0.2rem 0.4rem; font-size: var(--text-xs); }

	.actions { text-align: right; }

	/* Sous 640 px le tableau devient une pile de cartes (voir app.css) :
	   le nom prend toute la ligne, les rôles et le retrait se rangent dessous. */
	@media (max-width: 640px) {
		td.name { flex: 1 1 100%; font-size: var(--text-base); }
		td.actions { margin-left: auto; }

		/* Le sélecteur de rôle vit dans un <form> : en ligne, il reste sur la ligne du libellé. */
		td[data-label] form { display: inline-flex; vertical-align: middle; }
	}
</style>
