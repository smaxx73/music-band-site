<script lang="ts">
	import type { PageData } from './$types'

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

<main>
	<div class="header">
		<h1>Playlists</h1>
		<button class="btn-primary" onclick={() => (showForm = !showForm)}>
			{showForm ? 'Annuler' : '+ Nouvelle playlist'}
		</button>
	</div>

	{#if showForm}
		<form class="create-form" onsubmit={create}>
			{#if error}<p class="error">{error}</p>{/if}
			<label>
				Nom <span class="req">*</span>
				<input type="text" bind:value={name} required disabled={creating} />
			</label>
			<label>
				Description
				<input type="text" bind:value={description} disabled={creating} />
			</label>
			<button type="submit" class="btn-primary" disabled={creating}>
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
	main { max-width: 640px; margin: 2rem auto; padding: 0 1rem; font-family: sans-serif; }

	.header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; }
	h1 { font-size: 1.5rem; margin: 0; }

	.btn-primary {
		padding: 0.45rem 1rem; background: #1a1a1a; color: white;
		border: none; border-radius: 4px; font-size: 0.875rem; font-weight: 600; cursor: pointer;
	}
	.btn-primary:hover:not(:disabled) { background: #333; }
	.btn-primary:disabled { opacity: 0.45; cursor: not-allowed; }

	.create-form {
		background: #f8f8f8; border: 1px solid #e0e0e0; border-radius: 6px;
		padding: 1rem; margin-bottom: 1.5rem;
		display: flex; flex-direction: column; gap: 0.75rem;
	}

	label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.82rem; font-weight: 600; }
	input { padding: 0.4rem 0.6rem; border: 1px solid #ddd; border-radius: 4px; font-size: 0.875rem; }
	.req { color: #c0392b; }

	.list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.5rem; }

	.card {
		display: block; border: 1px solid #e8e8e8; border-radius: 6px;
		padding: 0.9rem 1rem; text-decoration: none; color: inherit; transition: border-color 0.15s;
	}
	.card:hover { border-color: #bbb; }

	.name { font-weight: 700; font-size: 0.95rem; }
	.desc { font-size: 0.82rem; color: #666; margin-top: 0.15rem; }
	.meta { font-size: 0.78rem; color: #aaa; margin-top: 0.3rem; }

	.error { color: #c0392b; font-size: 0.82rem; margin: 0; }
	.empty { color: #bbb; font-style: italic; }
</style>
