<script lang="ts">
	import type { PageData, ActionData } from './$types'
	import { enhance } from '$app/forms'
	import { formatBytes } from '$lib/types'

	let { data, form }: { data: PageData; form: ActionData } = $props()

	// La suppression n'est armée que lorsque le nom saisi correspond exactement.
	// Le serveur revérifie : c'est ici un garde-fou d'attention, pas de sécurité.
	let confirmation = $state('')
	let deletingGroup = $state(false)
	// Le navigateur ne signale pas la fin d'un téléchargement : ce drapeau atteste
	// que la sauvegarde a été lancée, pas qu'elle a abouti. C'est un garde-fou
	// d'attention, au même titre que la saisie du nom — la règle de droit est serveur.
	let backupStarted = $state(false)
	const confirmed = $derived(confirmation.trim() === data.group.name)

	const impactLines = $derived(
		data.deletionImpact
			? [
					{ label: 'membres (les comptes sont conservés)', value: `${data.deletionImpact.members}` },
					{ label: 'morceaux', value: `${data.deletionImpact.songs}` },
					{ label: 'sessions', value: `${data.deletionImpact.sessions}` },
					{
						label: 'prises',
						value: `${data.deletionImpact.recordings} — ${formatBytes(data.deletionImpact.audio_bytes)} d'audio`
					},
					{ label: 'commentaires', value: `${data.deletionImpact.comments}` },
					{ label: 'playlists', value: `${data.deletionImpact.playlists}` },
					{ label: "événements d'agenda", value: `${data.deletionImpact.calendar_events}` }
				]
			: []
	)

	let editingName = $state(false)
	let newName = $state('') // rempli à l'ouverture du champ de renommage
	let saving = $state(false)
	let removingId = $state<number | null>(null)

	const memberIds = $derived(new Set((data.members as unknown as { id: number }[]).map((m) => m.id)))
	const nonMembers = $derived(
		(data.allUsers as unknown as { id: number; nickname: string; display_name: string }[]).filter((u) => !memberIds.has(u.id))
	)
</script>

<svelte:head>
	<title>{data.group.name} — Groupe</title>
</svelte:head>

<main>
	<nav class="breadcrumb">
		<a href="/admin">Administration</a> /
		<a href="/admin/groups">Groupes</a> /
		<span>{data.group.name}</span>
	</nav>

	<!-- Nom du groupe -->
	<div class="group-header">
		{#if editingName}
			<form
				method="POST"
				action="?/rename"
				use:enhance={() => {
					saving = true
					return ({ update }) => { saving = false; editingName = false; update() }
				}}
				class="rename-form"
			>
				<input name="name" type="text" bind:value={newName} class="input-title" required />
				<button type="submit" class="btn-primary" disabled={saving}>Enregistrer</button>
				<button type="button" class="btn-ghost" onclick={() => { editingName = false; newName = data.group.name }}>
					Annuler
				</button>
			</form>
			{#if form?.action === 'rename' && form?.error}
				<p class="error">{form.error}</p>
			{/if}
		{:else}
			<h1>
				{data.group.name}
				<button
					class="btn-edit"
					onclick={() => { newName = data.group.name as string; editingName = true }}
					title="Renommer"
				>✏</button>
			</h1>
		{/if}
	</div>

	<!-- Membres -->
	<section class="section">
		<h2>Membres ({(data.members as unknown[]).length})</h2>

		{#if (data.members as unknown[]).length === 0}
			<p class="empty">Aucun membre.</p>
		{:else}
			<table>
				<thead>
					<tr>
						<th>Nom</th>
						<th>Rôle dans le groupe</th>
						<th>Rôle global</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each data.members as m}
						<tr>
							<td class="name">{m.display_name}</td>
							<td>
								<!-- Attribuer ou retirer le rôle d'admin de groupe est réservé au superadmin. -->
								{#if data.canAssignAdmin}
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
									<span class="muted">{m.group_role === 'admin' ? 'Admin' : 'Membre'}</span>
								{/if}
							</td>
							<td class="muted">{m.global_role}</td>
							<td>
								{#if m.group_role !== 'admin' || data.canAssignAdmin}
								<form
									method="POST"
									action="?/removeMember"
									use:enhance={() => {
										removingId = m.id
										return ({ update }) => { removingId = null; update() }
									}}
								>
									<input type="hidden" name="user_id" value={m.id} />
									<button
										type="submit"
										class="btn-delete"
										disabled={removingId === m.id}
									>
										{removingId === m.id ? '…' : 'Retirer'}
									</button>
								</form>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}

		{#if form?.error && (form?.action === 'removeMember' || form?.action === 'updateRole')}
			<p class="error">{form.error}</p>
		{/if}
	</section>

	<!-- Ajouter un membre -->
	{#if nonMembers.length > 0}
		<section class="section">
			<h2>Ajouter un membre</h2>
			<form method="POST" action="?/addMember" use:enhance class="add-form">
				<select name="user_id" class="input" required>
					<option value="">— Choisir un utilisateur —</option>
					{#each nonMembers as u}
							<option value={u.id}>{u.display_name} ({u.nickname})</option>
					{/each}
				</select>
				<select name="role" class="input-sm" aria-label="Rôle dans le groupe">
					<option value="member">Membre</option>
					{#if data.canAssignAdmin}<option value="admin">Admin</option>{/if}
				</select>
				<button type="submit" class="btn-primary">Ajouter</button>
			</form>
			{#if form?.action === 'addMember' && form?.error}
				<p class="error">{form.error}</p>
			{/if}
		</section>
	{/if}

	{#if data.canDelete && data.deletionImpact}
		<!-- Zone dangereuse : superadmin uniquement. Isolée en bas de page pour qu'aucune
		     action destructrice ne voisine avec la gestion courante des membres. -->
		<section class="danger-zone">
			<h2>Zone dangereuse</h2>

			<p class="danger-intro">
				Supprimer <strong>{data.group.name}</strong> détruit définitivement tout son contenu,
				fichiers audio compris. Cette action est irréversible et n'est pas sauvegardée.
			</p>

			<ul class="impact">
				{#each impactLines as line}
					<li><span class="impact-value">{line.value}</span> {line.label}</li>
				{/each}
			</ul>

			<ol class="steps">
				<li>
					<strong>Sauvegarder</strong>
					<p class="step-note">
						L'archive du groupe contient ses morceaux, sessions, prises, commentaires,
						playlists et agenda, plus le manifeste des fichiers audio (nom, taille, SHA-256).
						<strong>Elle ne contient pas les mp3 eux-mêmes</strong> — copiez-les depuis
						<code>AUDIO_DIR</code> en vous servant du manifeste si vous voulez pouvoir les rejouer.
					</p>
					<div class="step-actions">
						<a
							href="/api/groups/{data.group.id}/export"
							class="btn-secondary"
							download
							onclick={() => (backupStarted = true)}
						>
							Archive du groupe (.json)
						</a>
						<a
							href="/api/admin/backup"
							class="btn-secondary"
							download
							onclick={() => (backupStarted = true)}
						>
							Sauvegarde SQL complète (.sql)
						</a>
					</div>
					<p class="step-note">
						Seul le dump SQL est restaurable tel quel — c'est lui qu'il faut prendre
						si vous voulez pouvoir revenir en arrière.
					</p>
				</li>
				<li class:disabled={!backupStarted}>
					<strong>Confirmer</strong>
					{#if !backupStarted}
						<p class="step-note">Téléchargez d'abord une sauvegarde.</p>
					{/if}
				</li>
			</ol>

			<form
				method="POST"
				action="?/deleteGroup"
				use:enhance={() => {
					deletingGroup = true
					return ({ update }) => { deletingGroup = false; return update() }
				}}
				class="danger-form"
			>
				<label for="confirmation">
					Tapez <strong>{data.group.name}</strong> pour confirmer
				</label>
				<div class="danger-row">
					<input
						id="confirmation"
						name="confirmation"
						type="text"
						class="input"
						bind:value={confirmation}
						autocomplete="off"
						placeholder={data.group.name}
						disabled={!backupStarted}
					/>
					<button
						type="submit"
						class="btn-danger"
						disabled={!confirmed || !backupStarted || deletingGroup}
					>
						{deletingGroup ? 'Suppression…' : 'Supprimer définitivement'}
					</button>
				</div>
			</form>

			{#if form?.action === 'deleteGroup' && form?.error}
				<p class="error">{form.error}</p>
			{/if}
		</section>
	{/if}
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

	.group-header { margin-bottom: 2rem; }

	h1 {
		font-size: 1.5rem;
		margin: 0;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

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
	}

	.input-title {
		font-size: 1.3rem;
		font-weight: 700;
		padding: 0.2rem 0.5rem;
		border: 1px solid #ccc;
		border-radius: 4px;
		min-width: 240px;
	}

	.section { margin-bottom: 2.5rem; }

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
	.muted { color: #888; font-size: 0.82rem; }

	.role-select {
		font-size: 0.82rem;
		border: 1px solid #ddd;
		border-radius: 3px;
		padding: 0.15rem 0.4rem;
		background: white;
	}

	.btn-primary {
		padding: 0.45rem 1rem;
		background: #1a1a1a;
		color: #fff;
		border: none;
		border-radius: 4px;
		font-size: 0.875rem;
		cursor: pointer;
	}
	.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

	.btn-ghost {
		padding: 0.45rem 0.75rem;
		background: none;
		border: 1px solid #ccc;
		border-radius: 4px;
		font-size: 0.875rem;
		cursor: pointer;
		color: #555;
	}

	.btn-delete {
		padding: 0.2rem 0.55rem;
		border: 1px solid #f0c0c0;
		border-radius: 3px;
		background: #fff5f5;
		color: #c0392b;
		font-size: 0.78rem;
		cursor: pointer;
	}
	.btn-delete:hover:not(:disabled) { background: #ffe0e0; }
	.btn-delete:disabled { opacity: 0.5; cursor: not-allowed; }

	.add-form {
		display: flex;
		gap: 0.75rem;
		align-items: center;
	}

	.input {
		padding: 0.45rem 0.75rem;
		border: 1px solid #ccc;
		border-radius: 4px;
		font-size: 0.875rem;
		min-width: 200px;
	}

	.input-sm {
		padding: 0.45rem 0.6rem;
		border: 1px solid #ccc;
		border-radius: 4px;
		font-size: 0.875rem;
	}

	.empty { color: #aaa; font-style: italic; font-size: 0.9rem; }
	.error { color: #c0392b; font-size: 0.85rem; margin-top: 0.4rem; }

	.danger-zone {
		margin-top: 3rem;
		border: 1px solid #f0c9c9;
		border-radius: 6px;
		padding: 1.25rem;
		background: #fffafa;
	}

	.danger-zone h2 {
		margin: 0 0 0.75rem;
		font-size: 0.95rem;
		font-weight: 700;
		color: #b91c1c;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.danger-intro { margin: 0 0 1rem; font-size: 0.875rem; line-height: 1.5; }

	.impact {
		margin: 0 0 1.25rem;
		padding-left: 1.1rem;
		font-size: 0.85rem;
		line-height: 1.7;
		color: #555;
	}

	.impact-value { font-weight: 700; color: #1a1a1a; }

	.danger-form { display: flex; flex-direction: column; gap: 0.4rem; }
	.danger-form label { font-size: 0.82rem; color: #555; }

	.danger-row { display: flex; gap: 0.5rem; flex-wrap: wrap; }
	.danger-row .input { flex: 1 1 14rem; min-width: 0; }

	.btn-danger {
		padding: 0.45rem 1rem;
		border: none;
		border-radius: 4px;
		background: #b91c1c;
		color: #fff;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
	}
	.btn-danger:hover:not(:disabled) { background: #991b1b; }
	.btn-danger:disabled { background: #e5b4b4; cursor: not-allowed; }

	.steps {
		margin: 0 0 1.25rem;
		padding-left: 1.2rem;
		font-size: 0.85rem;
		line-height: 1.5;
	}

	.steps li { margin-bottom: 1rem; }
	.steps li.disabled { opacity: 0.55; }

	.step-note { margin: 0.35rem 0 0; color: #666; font-size: 0.82rem; }
	.step-note code { background: #f3f0f0; padding: 0.05rem 0.25rem; border-radius: 3px; }

	.step-actions {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		margin-top: 0.6rem;
	}

	.danger-form .input:disabled { background: #f5f2f2; cursor: not-allowed; }
</style>
