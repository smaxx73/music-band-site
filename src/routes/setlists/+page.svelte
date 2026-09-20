<script lang="ts">
	import type { PageData } from './$types'
	import { formatSetlistDuration } from '$lib/types'

	let { data }: { data: PageData } = $props()

	type SetlistRow = {
		id: number
		name: string
		description: string | null
		song_count: number
		total_duration_s: number
		missing_duration_count: number
	}

	const setlists = $derived(data.setlists as unknown as SetlistRow[])

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
			const res = await fetch('/api/setlists', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: name.trim(), description: description.trim() || undefined })
			})
			const json = await res.json()
			if (!res.ok) { error = json.error ?? 'Erreur.'; return }
			window.location.href = `/setlists/${json.id}`
		} finally {
			creating = false
		}
	}
</script>

<svelte:head>
	<title>Setlists</title>
</svelte:head>

<main>
	<div class="header">
		<h1>Setlists</h1>
		<button class="btn btn-primary" onclick={() => (showForm = !showForm)}>
			{showForm ? 'Annuler' : '+ Nouvelle setlist'}
		</button>
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

	{#if setlists.length === 0}
		<p class="empty">Aucune setlist pour l'instant.</p>
	{:else}
		<ul class="list">
			{#each setlists as s}
				<li>
					<a href="/setlists/{s.id}" class="card">
						<div class="name">{s.name}</div>
						{#if s.description}<div class="desc">{s.description}</div>{/if}
						<div class="meta">
							{s.song_count} morceau{s.song_count > 1 ? 'x' : ''}
							{#if s.song_count > 0}
								· {formatSetlistDuration({ total_s: s.total_duration_s, missing: s.missing_duration_count })}
							{/if}
						</div>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</main>

<style>
	main { max-width: 640px; margin: 2rem auto; padding: 0 1rem; }

	.header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; }
	h1 { font-size: var(--text-xl); margin: 0; }

	.create-form { margin-bottom: 1.5rem; }

	.req { color: var(--color-error); }

	.list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.5rem; }

	.card {
		display: block; border: 1px solid var(--color-border-light); border-radius: var(--radius-lg);
		padding: 0.9rem 1rem; text-decoration: none; color: inherit; transition: border-color 0.15s;
	}
	.card:hover { border-color: #bbb; }

	.name { font-weight: 700; font-size: 0.95rem; }
	.desc { font-size: 0.82rem; color: #666; margin-top: 0.15rem; }
	.meta { font-size: 0.78rem; color: #aaa; margin-top: 0.3rem; }
</style>
