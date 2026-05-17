<script lang="ts">
	import type { PageData } from './$types'
	import { formatDateOnly } from '$lib/date'

	let { data }: { data: PageData } = $props()

	type SessionRow = {
		id: number
		date: string
		type: string
		title: string | null
		location: string | null
		members: string[]
		song_count: number
		recording_count: number
	}

	const typeLabels: Record<string, string> = {
		repetition: 'Répétition',
		concert: 'Concert',
		studio: 'Studio',
		autre: 'Autre',
	}

	const sessions = $derived(data.sessions as unknown as SessionRow[])

	function formatDate(d: string | Date) {
		return formatDateOnly(d, {
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
						<div class="session-top">
							<span class="type-badge type-{s.type ?? 'repetition'}">{typeLabels[s.type] ?? s.type}</span>
							<div class="session-date">{s.title ?? formatDate(s.date)}</div>
						</div>
						{#if s.title}
							<div class="session-location">{formatDate(s.date)}</div>
						{:else if s.location}
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
	}

	h1 {
		font-size: var(--text-xl);
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
		border: 1px solid var(--color-border);
		border-radius: var(--radius-xl);
		padding: 1rem 1.25rem;
		text-decoration: none;
		color: inherit;
		transition: border-color 0.15s, box-shadow 0.15s;
	}

	.session-card:hover {
		border-color: #aaa;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.07);
	}

	.session-top {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.1rem;
	}

	.type-badge {
		font-size: 0.68rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		padding: 0.1rem 0.45rem;
		border-radius: var(--radius-sm);
		white-space: nowrap;
		flex-shrink: 0;
	}

	.type-badge.type-repetition { background: var(--color-accent-light); color: var(--color-accent); }
	.type-badge.type-concert    { background: var(--color-green-light);  color: var(--color-green); }
	.type-badge.type-studio     { background: #f3e8ff; color: #7c3aed; }
	.type-badge.type-autre      { background: var(--color-bg-subtle);    color: var(--color-text-secondary); }

	.session-date {
		font-weight: 700;
		font-size: var(--text-base);
	}

	.session-location {
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		margin-top: 0.15rem;
	}

	.session-meta {
		font-size: 0.8rem;
		color: var(--color-text-muted);
		margin-top: 0.4rem;
	}
</style>
