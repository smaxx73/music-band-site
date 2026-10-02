<script lang="ts">
	import type { PageData } from './$types'
	import Icon from '$lib/components/Icon.svelte'

	let { data }: { data: PageData } = $props()

	type PlaylistRow = { id: number; name: string; description: string | null; item_count: number; updated_at: string }

	const playlists = $derived(data.playlists as unknown as PlaylistRow[])

	let showForm = $state(false)
	let name = $state('')
	let description = $state('')
	let creating = $state(false)
	let error = $state<string | null>(null)

	async function create(e: SubmitEvent) {
		e.preventDefault()
		if (!name.trim()) { error = 'Le nom est obligatoire.'; return }
		error = null
		creating = true
		try {
			const res = await fetch('/api/playlists', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: name.trim(), description: description.trim() || undefined })
			})
			const json = await res.json()
			if (!res.ok) { error = json.error ?? 'Erreur.'; return }
			window.location.href = `/playlists/${json.id}`
		} finally {
			creating = false
		}
	}
</script>

<svelte:head>
	<title>Playlists</title>
</svelte:head>

<main class="page page-narrow">
	<div class="page-header">
		<h1>Playlists</h1>
		{#if showForm}
			<button class="btn btn-secondary" onclick={() => (showForm = false)}>Annuler</button>
		{:else}
			<button class="btn btn-primary" onclick={() => (showForm = true)}><Icon name="plus" /> Nouvelle playlist</button>
		{/if}
	</div>

	{#if showForm}
		<form class="form-section create-form" onsubmit={create}>
			{#if error}<p class="message-error">{error}</p>{/if}
			<label class="form-label">
				Nom <span class="req">*</span>
				<input class="form-input" type="text" bind:value={name} required disabled={creating} />
			</label>
			<label class="form-label">
				Description
				<input class="form-input" type="text" bind:value={description} disabled={creating} />
			</label>
			<button type="submit" class="btn btn-primary" disabled={creating}>
				{creating ? 'Création…' : 'Créer'}
			</button>
		</form>
	{/if}

	{#if playlists.length === 0}
		<p class="empty">Aucune playlist pour l'instant.</p>
	{:else}
		<ul class="list">
			{#each playlists as p}
				<li>
					<a href="/playlists/{p.id}" class="card">
						<div class="name">{p.name}</div>
						{#if p.description}<div class="desc">{p.description}</div>{/if}
						<div class="meta">{p.item_count} prise{p.item_count > 1 ? 's' : ''}</div>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</main>

<style>

	.create-form { margin-bottom: 1.5rem; }

	.req { color: var(--color-error); }

	.list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.5rem; }

	.card {
		display: block; border: 1px solid var(--color-border-light); border-radius: var(--radius-lg);
		padding: 0.9rem 1rem; text-decoration: none; color: inherit; transition: border-color 0.15s;
	}
	.card:hover { border-color: var(--color-border); }

	.name { font-weight: 700; font-size: var(--text-base); }
	.desc { font-size: var(--text-sm); color: var(--color-text-secondary); margin-top: 0.15rem; }
	.meta { font-size: var(--text-xs); color: var(--color-text-muted); margin-top: 0.3rem; }
</style>
