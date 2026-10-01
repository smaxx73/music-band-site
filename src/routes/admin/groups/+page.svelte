<script lang="ts">
	import type { PageData, ActionData } from './$types'
	import { enhance } from '$app/forms'

	let { data, form }: { data: PageData; form: ActionData } = $props()

	let creating = $state(false)
	let newName = $state('')

	function hasActionError(action: string, id?: number) {
		if (form?.action !== action || !form.error) return false
		if (id === undefined) return true
		return 'id' in form && form.id === id
	}
</script>

<svelte:head>
	<title>Gestion des groupes</title>
</svelte:head>

<main class="page page-wide">
	<nav class="breadcrumb">
		<a href="/admin">Administration</a> / <span>Groupes</span>
	</nav>

	<h1>Groupes</h1>

	<!-- Création -->
	<section class="section">
		<h2 class="section-title">Nouveau groupe</h2>
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
					aria-label="Nom du groupe"
					required
					class="form-input"
				/>
				<button type="submit" class="btn btn-primary" disabled={creating || !newName.trim()}>
					{creating ? 'Création…' : 'Créer'}
				</button>
			</div>
			{#if hasActionError('create')}
				<p class="message-error">{form?.error}</p>
			{/if}
		</form>
	</section>

	<!-- Liste -->
	<section class="section">
		<h2 class="section-title">Groupes existants</h2>

		{#if data.groups.length === 0}
			<p class="empty">Aucun groupe.</p>
		{:else}
			<div class="table-scroll">
				<table class="data-table">
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
								<td class="name"><a href="/admin/groups/{g.id}">{g.name}</a></td>
								<td class="muted" data-label="Membres">{g.member_count}</td>
								<td class="muted" data-label="Morceaux">{g.song_count}</td>
								<td class="muted" data-label="Sessions">{g.session_count}</td>
								<td class="actions-cell">
									<!-- La suppression vit dans la zone dangereuse de la fiche du groupe :
									     elle exige l'impact chiffré et la saisie du nom. -->
									<a href="/admin/groups/{g.id}" class="btn btn-secondary btn-sm">Gérer</a>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>
</main>

<style>
	h1 { font-size: var(--text-xl); margin: 0 0 1.75rem; }

	.form-row {
		display: flex;
		gap: 0.75rem;
		align-items: center;
		flex-wrap: wrap;
	}

	.form-row .form-input { flex: 1 1 12rem; max-width: 320px; }

	form > .message-error { margin-top: 0.5rem; }

	td a { color: inherit; text-decoration: none; font-weight: 600; }
	td a:hover { text-decoration: underline; }

	.muted { color: var(--color-text-muted); font-size: var(--text-sm); }

	.actions-cell {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	/* Sous 640 px le tableau devient une pile de cartes (voir app.css). */
	@media (max-width: 640px) {
		td.name { flex: 1 1 100%; font-size: var(--text-base); }
		td.actions-cell { flex: 1 1 100%; margin-top: 0.35rem; }
	}
</style>
