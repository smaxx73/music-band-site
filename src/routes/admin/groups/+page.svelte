<script lang="ts">
	import type { PageData, ActionData } from './$types'
	import { enhance } from '$app/forms'

	let { data, form }: { data: PageData; form: ActionData } = $props()

	let creating = $state(false)
	let newName = $state('')
	let deletingId = $state<number | null>(null)
</script>

<svelte:head>
	<title>Gestion des groupes</title>
</svelte:head>

<main>
	<nav class="breadcrumb">
		<a href="/admin">Administration</a> / <span>Groupes</span>
	</nav>

	<h1>Groupes</h1>

	<!-- Création -->
	<section class="section">
		<h2>Nouveau groupe</h2>
		<form
			method="POST"
			action="?/create"
			use:enhance={() => {
				creating = true
				return ({ update }) => { creating = false; newName = ''; update() }
			}}
		>
			<div class="form-row">
				<input
					name="name"
					type="text"
					placeholder="Nom du groupe"
					bind:value={newName}
					required
					class="input"
				/>
				<button type="submit" class="btn-primary" disabled={creating || !newName.trim()}>
					{creating ? 'Création…' : 'Créer'}
				</button>
			</div>
			{#if form?.action === 'create' && form?.error}
				<p class="error">{form.error}</p>
			{/if}
		</form>
	</section>

	<!-- Liste -->
	<section class="section">
		<h2>Groupes existants</h2>

		{#if data.groups.length === 0}
			<p class="empty">Aucun groupe.</p>
		{:else}
			<table>
				<thead>
					<tr>
						<th>Nom</th>
						<th>Membres</th>
						<th>Morceaux</th>
						<th>Sessions</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each data.groups as g}
						<tr>
							<td><a href="/admin/groups/{g.id}">{g.name}</a></td>
							<td class="muted">{g.member_count}</td>
							<td class="muted">{g.song_count}</td>
							<td class="muted">{g.session_count}</td>
							<td class="actions-cell">
								<a href="/admin/groups/{g.id}" class="btn-secondary">Gérer</a>
								<form
									method="POST"
									action="?/delete"
									use:enhance={() => {
										deletingId = g.id
										return ({ update }) => { deletingId = null; update() }
									}}
								>
									<input type="hidden" name="id" value={g.id} />
									<button
										type="submit"
										class="btn-delete"
										disabled={deletingId === g.id || g.session_count > 0}
										title={g.session_count > 0 ? 'Impossible : des sessions existent' : ''}
									>
										{deletingId === g.id ? '…' : 'Supprimer'}
									</button>
								</form>
							</td>
						</tr>
						{#if form?.action === 'delete' && form?.id === g.id && form?.error}
							<tr>
								<td colspan="5" class="error">{form.error}</td>
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

	h1 { font-size: 1.5rem; margin: 0 0 1.75rem; }

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

	.form-row {
		display: flex;
		gap: 0.75rem;
		align-items: center;
	}

	.input {
		flex: 1;
		max-width: 320px;
		padding: 0.45rem 0.75rem;
		border: 1px solid #ccc;
		border-radius: 4px;
		font-size: 0.875rem;
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

	.btn-secondary {
		display: inline-block;
		padding: 0.25rem 0.65rem;
		border: 1px solid #ccc;
		border-radius: 4px;
		text-decoration: none;
		font-size: 0.82rem;
		color: inherit;
		cursor: pointer;
		background: white;
	}
	.btn-secondary:hover { background: #f4f4f4; }

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

	td a { color: inherit; text-decoration: none; font-weight: 600; }
	td a:hover { text-decoration: underline; }

	.muted { color: #888; font-size: 0.82rem; }

	.actions-cell {
		display: flex;
		gap: 0.5rem;
		align-items: center;
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
	.btn-delete:disabled { opacity: 0.4; cursor: not-allowed; }

	.empty { color: #aaa; font-style: italic; font-size: 0.9rem; }
	.error { color: #c0392b; font-size: 0.85rem; margin-top: 0.4rem; }
</style>
