<script lang="ts">
	import type { PageData, ActionData } from './$types'
	import { enhance } from '$app/forms'
	import { formatBytes } from '$lib/types'
	import Icon from '$lib/components/Icon.svelte'
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte'
	import { createSubmitConfirm } from '$lib/confirm-submit.svelte'
	import { groupRoleChangeRequest, removeMemberRequest } from '$lib/group-roles'

	let { data, form }: { data: PageData; form: ActionData } = $props()

	const ask = createSubmitConfirm()

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
					{ label: 'setlists', value: `${data.deletionImpact.setlists}` },
					{ label: 'publications (les enregistrements perso restent à leurs auteurs)', value: `${data.deletionImpact.posts}` },
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

<main class="page page-wide">
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
				<input name="name" type="text" bind:value={newName} class="form-input input-title" aria-label="Nom du groupe" required />
				<button type="submit" class="btn btn-primary" disabled={saving}>Enregistrer</button>
				<button type="button" class="btn btn-secondary" onclick={() => { editingName = false; newName = data.group.name }}>
					Annuler
				</button>
			</form>
			{#if form?.action === 'rename' && form?.error}
				<p class="message-error">{form.error}</p>
			{/if}
		{:else}
			<h1>
				{data.group.name}
				<button
					class="btn btn-ghost btn-sm"
					onclick={() => { newName = data.group.name as string; editingName = true }}
					title="Renommer"
				><Icon name="pencil" size="0.85rem" label="Renommer le groupe" /></button>
			</h1>
		{/if}
	</div>

	<!-- Membres -->
	<section class="section">
		<h2 class="section-title">Membres ({(data.members as unknown[]).length})</h2>

		{#if (data.members as unknown[]).length === 0}
			<p class="empty">Aucun membre.</p>
		{:else}
			<div class="table-scroll">
				<table class="data-table">
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
								<td data-label="Groupe">
									<!-- Attribuer ou retirer le rôle d'admin de groupe est réservé au superadmin. -->
									{#if data.canAssignAdmin}
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
										<span class="badge badge-group-{m.group_role}">{m.group_role === 'admin' ? 'Admin' : 'Membre'}</span>
									{/if}
								</td>
								<td class="muted" data-label="Global">{m.global_role}</td>
								<td class="actions-cell">
									{#if m.group_role !== 'admin' || data.canAssignAdmin}
									<form
										method="POST"
										action="?/removeMember"
										use:enhance={({ formElement, cancel }) => {
											if (ask.intercept(formElement, cancel, removeMemberRequest(m.display_name))) return
											removingId = m.id
											return ({ update }) => { removingId = null; update() }
										}}
									>
										<input type="hidden" name="user_id" value={m.id} />
										<button
											type="submit"
											class="btn btn-danger btn-sm"
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
			</div>
		{/if}

		{#if form?.error && (form?.action === 'removeMember' || form?.action === 'updateRole')}
			<p class="message-error">{form.error}</p>
		{/if}
	</section>

	<!-- Ajouter un membre -->
	{#if nonMembers.length > 0}
		<section class="section">
			<h2 class="section-title">Ajouter un membre</h2>
			<form method="POST" action="?/addMember" use:enhance class="add-form">
				<select name="user_id" class="form-input user-select" aria-label="Utilisateur à ajouter" required>
					<option value="">— Choisir un utilisateur —</option>
					{#each nonMembers as u}
							<option value={u.id}>{u.display_name} ({u.nickname})</option>
					{/each}
				</select>
				<select name="role" class="form-input" aria-label="Rôle dans le groupe">
					<option value="member">Membre</option>
					{#if data.canAssignAdmin}<option value="admin">Admin</option>{/if}
				</select>
				<button type="submit" class="btn btn-primary">Ajouter</button>
			</form>
			{#if form?.action === 'addMember' && form?.error}
				<p class="message-error">{form.error}</p>
			{/if}
		</section>
	{/if}

	{#if data.canDelete && data.deletionImpact}
		<!-- Zone dangereuse : superadmin uniquement. Isolée en bas de page pour qu'aucune
		     action destructrice ne voisine avec la gestion courante des membres. -->
		<section class="danger-zone">
			<h2 class="section-title">Zone dangereuse</h2>

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
						playlists, setlists et agenda, plus le manifeste des fichiers audio (nom, taille, SHA-256).
						<strong>Elle ne contient pas les mp3 eux-mêmes</strong> — copiez-les depuis
						<code>AUDIO_DIR</code> en vous servant du manifeste si vous voulez pouvoir les rejouer.
					</p>
					<div class="step-actions">
						<a
							href="/api/groups/{data.group.id}/export"
							class="btn btn-secondary"
							download
							onclick={() => (backupStarted = true)}
						>
							Archive du groupe (.json)
						</a>
						<a
							href="/api/admin/backup"
							class="btn btn-secondary"
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
						class="form-input"
						bind:value={confirmation}
						autocomplete="off"
						placeholder={data.group.name}
						disabled={!backupStarted}
					/>
					<button
						type="submit"
						class="btn btn-danger btn-solid"
						disabled={!confirmed || !backupStarted || deletingGroup}
					>
						{deletingGroup ? 'Suppression…' : 'Supprimer définitivement'}
					</button>
				</div>
			</form>

			{#if form?.action === 'deleteGroup' && form?.error}
				<p class="message-error">{form.error}</p>
			{/if}
		</section>
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
	.group-header { margin-bottom: 2rem; }

	h1 {
		font-size: var(--text-xl);
		margin: 0;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.section > .message-error { margin-top: 0.5rem; }

	.rename-form {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		flex-wrap: wrap;
	}

	.input-title {
		flex: 1 1 15rem;
		min-width: 0;
		font-size: 1.3rem;
		font-weight: 700;
	}

	.name { font-weight: 600; }
	.muted { color: var(--color-text-muted); font-size: 0.82rem; }

	.role-select { padding: 0.2rem 0.4rem; font-size: 0.8rem; }

	.add-form {
		display: flex;
		gap: 0.75rem;
		align-items: center;
		flex-wrap: wrap;
	}

	.user-select { flex: 1 1 14rem; min-width: 0; }

	.danger-zone {
		margin-top: 3rem;
		border: 1px solid var(--color-danger-border);
		border-radius: var(--radius-lg);
		padding: 1.25rem;
		background: var(--color-danger-bg);
	}

	.danger-zone .section-title {
		margin: 0 0 0.75rem;
		font-size: 0.95rem;
		color: var(--color-error);
		border-bottom: none;
		padding-bottom: 0;
	}

	.danger-intro { margin: 0 0 1rem; font-size: var(--text-sm); line-height: 1.5; }

	.impact {
		margin: 0 0 1.25rem;
		padding-left: 1.1rem;
		font-size: 0.85rem;
		line-height: 1.7;
		color: var(--color-text-secondary);
	}

	.impact-value { font-weight: 700; color: var(--color-text); }

	.danger-form { display: flex; flex-direction: column; gap: 0.4rem; }
	.danger-form label { font-size: 0.82rem; color: var(--color-text-secondary); }

	.danger-row { display: flex; gap: 0.5rem; flex-wrap: wrap; }
	.danger-row .form-input { flex: 1 1 14rem; min-width: 0; }

	.steps {
		margin: 0 0 1.25rem;
		padding-left: 1.2rem;
		font-size: 0.85rem;
		line-height: 1.5;
	}

	.steps li { margin-bottom: 1rem; }
	.steps li.disabled { opacity: 0.55; }

	.step-note { margin: 0.35rem 0 0; color: var(--color-text-secondary); font-size: 0.82rem; }
	.step-note code { background: var(--color-bg-muted); padding: 0.05rem 0.25rem; border-radius: var(--radius-sm); }

	.step-actions {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		margin-top: 0.6rem;
	}

	/* Sous 640 px le tableau devient une pile de cartes (voir app.css). */
	@media (max-width: 640px) {
		td.name { flex: 1 1 100%; font-size: var(--text-base); }
		td.actions-cell { margin-left: auto; }

		/* Le sélecteur de rôle vit dans un <form> : en ligne, il reste sur la ligne du libellé. */
		td[data-label] form { display: inline-flex; vertical-align: middle; }
	}
</style>
