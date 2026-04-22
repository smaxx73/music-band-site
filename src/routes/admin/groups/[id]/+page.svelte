<script lang="ts">
	import type { PageData, ActionData } from './$types'
	import { enhance } from '$app/forms'

	let { data, form }: { data: PageData; form: ActionData } = $props()

	let editingName = $state(false)
	let newName = $state(data.group.name as string)
	let saving = $state(false)
	let removingId = $state<number | null>(null)

	const memberIds = $derived(new Set((data.members as { id: number }[]).map((m) => m.id)))
	const nonMembers = $derived(
		(data.allUsers as { id: number; name: string }[]).filter((u) => !memberIds.has(u.id))
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
				<button class="btn-edit" onclick={() => editingName = true} title="Renommer">✏</button>
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
							<td class="name">{m.name}</td>
							<td>
								<form method="POST" action="?/updateRole" use:enhance>
									<input type="hidden" name="user_id" value={m.id} />
									<select
										name="role"
										class="role-select"
										onchange={(e) => (e.currentTarget.form as HTMLFormElement).requestSubmit()}
									>
										<option value="member" selected={m.group_role === 'member'}>Membre</option>
										<option value="admin" selected={m.group_role === 'admin'}>Admin</option>
									</select>
								</form>
							</td>
							<td class="muted">{m.global_role}</td>
							<td>
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
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
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
						<option value={u.id}>{u.name}</option>
					{/each}
				</select>
				<select name="role" class="input-sm">
					<option value="member">Membre</option>
					<option value="admin">Admin</option>
				</select>
				<button type="submit" class="btn-primary">Ajouter</button>
			</form>
			{#if form?.action === 'addMember' && form?.error}
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
</style>
