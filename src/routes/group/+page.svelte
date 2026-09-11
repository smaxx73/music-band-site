<script lang="ts">
	import type { PageData, ActionData } from './$types'
	import { enhance } from '$app/forms'
	import { formatDateOnly } from '$lib/date'
	import {
		GROUP_LINK_LABELS,
		groupLogoUrl,
		isAdmin,
		type GroupLinkField
	} from '$lib/types'

	let { data, form }: { data: PageData; form: ActionData } = $props()

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

<main>
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
				<input name="name" type="text" bind:value={newName} class="input-title" required />
				<button type="submit" class="btn-primary">Enregistrer</button>
				<button type="button" class="btn-ghost" onclick={() => (editingName = false)}>Annuler</button>
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
						class="btn-edit"
						title="Renommer le groupe"
						onclick={() => { newName = data.group.name as string; editingName = true }}
					>✏</button>
				{/if}
			</h1>
		{/if}
		{#if form?.action === 'rename' && form?.error}
			<p class="error">{form.error}</p>
		{/if}

		<!-- Informations -->
		<section class="section">
			<h2>Informations</h2>
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
			<h2>Membres ({data.members.length})</h2>

			{#if data.members.length === 0}
				<p class="empty">Aucun membre.</p>
			{:else}
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
								<td>
									{#if data.canAssignAdmin}
										<!-- Seul le superadmin peut attribuer ou retirer le rôle d'admin de groupe. -->
										<form method="POST" action="?/updateRole" use:enhance>
											<input type="hidden" name="user_id" value={m.id} />
											<select
												name="role"
												class="role-select"
												aria-label="Rôle de {m.display_name} dans le groupe"
												onchange={(e) => (e.currentTarget.form as HTMLFormElement).requestSubmit()}
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
									<td>
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
												use:enhance={() => {
													busyMemberId = m.id
													return ({ update }) => { busyMemberId = null; return update() }
												}}
												onsubmit={(e) => {
													if (!confirm(`Retirer ${m.display_name} du groupe ?`)) e.preventDefault()
												}}
											>
												<input type="hidden" name="user_id" value={m.id} />
												<button type="submit" class="btn-remove" disabled={busyMemberId === m.id}>
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
			{/if}

			{#if form?.error && (form?.action === 'removeMember' || form?.action === 'updateRole')}
				<p class="error">{form.error}</p>
			{/if}
		</section>

		{#if data.canManage}
			<!-- Ajout par pseudo exact : un admin de groupe n'a pas à voir l'annuaire
			     des comptes des autres groupes de la plateforme. -->
			<section class="section">
				<h2>Ajouter un membre</h2>
				<form method="POST" action="?/addMember" use:enhance class="add-form">
					<input
						name="nickname"
						type="text"
						class="input"
						placeholder="Pseudo du membre"
						aria-label="Pseudo du membre à ajouter"
						autocomplete="off"
						required
					/>
					<button type="submit" class="btn-primary">Ajouter</button>
				</form>
				<p class="hint">Le membre est ajouté avec le rôle « Membre ».</p>
				{#if form?.action === 'addMember' && form?.error}
					<p class="error">{form.error}</p>
				{:else if form?.action === 'addMember' && form?.added}
					<p class="success">{form.added} a rejoint le groupe.</p>
				{/if}
			</section>

			<section class="section">
				<h2>Logo</h2>
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
							<button type="submit" class="btn-primary" disabled={uploadingLogo}>
								{uploadingLogo ? 'Envoi…' : data.group.logo_version ? 'Remplacer' : 'Envoyer'}
							</button>
						</form>
						<p class="hint">PNG, JPEG, WebP ou GIF, 2 Mo maximum. Une image carrée rend le mieux.</p>

						{#if data.group.logo_version}
							<form
								method="POST"
								action="?/removeLogo"
								use:enhance
								onsubmit={(e) => { if (!confirm('Retirer le logo du groupe ?')) e.preventDefault() }}
							>
								<button type="submit" class="btn-remove">Retirer le logo</button>
							</form>
						{/if}
					</div>
				</div>
				{#if logoError}
					<p class="error">{logoError}</p>
				{:else if (form?.action === 'uploadLogo' || form?.action === 'removeLogo') && form?.error}
					<p class="error">{form.error}</p>
				{/if}
			</section>

			<section class="section">
				<h2>Réseaux</h2>
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
							class="input"
							placeholder={LINK_PLACEHOLDERS[field]}
							value={linkValue(field)}
							autocomplete="off"
						/>
					{/each}
					<div class="links-submit">
						<button type="submit" class="btn-primary">Enregistrer</button>
					</div>
				</form>
				<p class="hint">Laisser un champ vide retire le lien.</p>
				{#if form?.action === 'updateLinks' && form?.error}
					<p class="error">{form.error}</p>
				{:else if form?.action === 'updateLinks' && form && 'saved' in form}
					<p class="success">Liens enregistrés.</p>
				{/if}
			</section>
		{/if}
	{/if}
</main>

<style>
	main {
		max-width: 700px;
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

	.info-list {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.6rem 1.5rem;
		margin: 0 0 1rem;
	}

	.info-list dt {
		font-weight: 600;
		color: #666;
		font-size: 0.85rem;
	}

	.info-list dd { margin: 0; }

	.group-title {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	.group-logo {
		width: 56px;
		height: 56px;
		border-radius: 50%;
		object-fit: cover;
		border: 1px solid #e5e5e5;
		background: #fff;
		flex-shrink: 0;
	}

	.links { display: flex; flex-wrap: wrap; gap: 0.4rem; }

	.social-link {
		display: inline-block;
		padding: 0.15rem 0.6rem;
		border-radius: 999px;
		font-size: 0.8rem;
		font-weight: 600;
		text-decoration: none;
		border: 1px solid currentColor;
	}
	.social-link:hover { text-decoration: underline; }
	.social-youtube_url { color: #c4302b; }
	.social-facebook_url { color: #1877f2; }
	.social-instagram_url { color: #c13584; }

	.logo-editor {
		display: flex;
		gap: 1.25rem;
		align-items: flex-start;
		flex-wrap: wrap;
	}

	.logo-preview {
		width: 96px;
		height: 96px;
		border-radius: 50%;
		object-fit: cover;
		border: 1px solid #e5e5e5;
		background: #fff;
		flex-shrink: 0;
	}

	.logo-empty {
		display: flex;
		align-items: center;
		justify-content: center;
		color: #aaa;
		font-size: 0.75rem;
		border-style: dashed;
	}

	.logo-actions {
		flex: 1 1 16rem;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.logo-actions .hint { margin: 0; }

	.input-file {
		flex: 1 1 12rem;
		min-width: 0;
		font-size: 0.85rem;
	}

	.links-form {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.5rem 1rem;
		align-items: center;
	}
	.links-form label { font-weight: 600; color: #666; font-size: 0.85rem; }
	.links-submit { grid-column: 2; }

	@media (max-width: 480px) {
		.links-form { grid-template-columns: 1fr; }
		.links-submit { grid-column: 1; }
	}

	.admin-link { font-size: 0.875rem; }
	.admin-link a { color: inherit; }

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

	.name { font-weight: 600; }

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
	.badge-group-admin { background: #e8f0fe; color: #1a56db; }
	.badge-group-member { background: #f0f0f0; color: #555; }

	.error {
		color: #b91c1c;
		font-size: 0.85rem;
		margin: 0.5rem 0 0;
	}

	.success {
		color: #15803d;
		font-size: 0.85rem;
		margin: 0.5rem 0 0;
	}

	.hint { color: #888; font-size: 0.8rem; margin: 0.5rem 0 0; }

	.btn-edit {
		background: none;
		border: none;
		cursor: pointer;
		font-size: 0.9rem;
		padding: 0.1rem 0.3rem;
		color: #aaa;
		border-radius: 3px;
	}
	.btn-edit:hover { color: #555; background: #f0f0f0; }

	.rename-form {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		margin-bottom: 2rem;
		flex-wrap: wrap;
	}

	.input-title {
		font-size: 1.3rem;
		font-weight: 700;
		padding: 0.3rem 0.5rem;
		border: 1px solid #ccc;
		border-radius: 4px;
		flex: 1 1 12rem;
		min-width: 0;
	}

	.add-form { display: flex; gap: 0.5rem; flex-wrap: wrap; }

	.input {
		padding: 0.4rem 0.6rem;
		border: 1px solid #ccc;
		border-radius: 4px;
		font-size: 0.9rem;
		flex: 1 1 12rem;
		min-width: 0;
	}

	.role-select {
		padding: 0.2rem 0.4rem;
		border: 1px solid #ddd;
		border-radius: 4px;
		font-size: 0.8rem;
		background: #fff;
	}

	.btn-primary {
		padding: 0.4rem 0.9rem;
		border: none;
		border-radius: 4px;
		background: #1a1a1a;
		color: #fff;
		font-size: 0.85rem;
		cursor: pointer;
	}
	.btn-primary:hover { background: #333; }

	.btn-ghost {
		padding: 0.4rem 0.9rem;
		border: 1px solid #ddd;
		border-radius: 4px;
		background: #fff;
		font-size: 0.85rem;
		cursor: pointer;
	}

	.btn-remove {
		padding: 0.2rem 0.6rem;
		border: 1px solid #f0d0d0;
		border-radius: 4px;
		background: #fff;
		color: #b91c1c;
		font-size: 0.78rem;
		cursor: pointer;
	}
	.btn-remove:hover:not(:disabled) { background: #fef2f2; }
	.btn-remove:disabled { opacity: 0.5; cursor: default; }

	.actions { text-align: right; }

	.empty { color: #aaa; font-style: italic; font-size: 0.9rem; }
</style>
