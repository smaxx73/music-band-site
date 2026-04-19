<script lang="ts">
	import type { PageData } from './$types'

	let { data }: { data: PageData } = $props()

	type SessionRow = {
		id: number
		date: string
		location: string | null
		members: string[]
		song_count: number
		recording_count: number
	}

	const sessions = $derived(data.sessions as unknown as SessionRow[])

	function formatDate(d: string) {
		return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', {
			weekday: 'long',
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		})
	}
</script>

<svelte:head>
	<title>Sessions</title>
</svelte:head>

<main>
	<h1>Sessions</h1>

	{#if sessions.length === 0}
		<p class="empty">Aucune session pour l'instant. <a href="/upload">Uploader une première prise →</a></p>
	{:else}
		<ul class="sessions-list">
			{#each sessions as s}
				<li>
					<a href="/sessions/{s.id}" class="session-card">
						<div class="session-date">{formatDate(s.date)}</div>
						{#if s.location}
							<div class="session-location">{s.location}</div>
						{/if}
						<div class="session-meta">
							{s.song_count} morceau{s.song_count > 1 ? 'x' : ''} ·
							{s.recording_count} prise{s.recording_count > 1 ? 's' : ''}
							{#if s.members?.length}
								· {s.members.join(', ')}
							{/if}
						</div>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</main>

<style>
	main {
		max-width: 680px;
		margin: 2rem auto;
		padding: 0 1rem;
		font-family: sans-serif;
	}

	h1 {
		font-size: 1.5rem;
		margin: 0 0 1.5rem;
	}

	.sessions-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.session-card {
		display: block;
		border: 1px solid #e0e0e0;
		border-radius: 8px;
		padding: 1rem 1.25rem;
		text-decoration: none;
		color: inherit;
		transition: border-color 0.15s, box-shadow 0.15s;
	}

	.session-card:hover {
		border-color: #aaa;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.07);
	}

	.session-date {
		font-weight: 700;
		font-size: 1rem;
		text-transform: capitalize;
	}

	.session-location {
		font-size: 0.875rem;
		color: #555;
		margin-top: 0.15rem;
	}

	.session-meta {
		font-size: 0.8rem;
		color: #888;
		margin-top: 0.4rem;
	}

	.empty {
		color: #888;
		font-style: italic;
	}
</style>
