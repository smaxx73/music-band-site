<script lang="ts">
	import type { PageData } from './$types'
	import { formatDateOnly, toDateOnly } from '$lib/date'

	let { data }: { data: PageData } = $props()

	type SessionRow = {
		id: number; date: string; location: string | null
		members: string[]; song_count: number; song_titles: string[]
	}
	type PlaylistRow = { id: number; name: string; item_count: number; updated_at: string }
	type Stats = { session_count: number; recording_count: number; playlist_count: number }
	type NextEvent = { id: number; date: string; type: string; title: string | null; notes: string | null }

	const sessions = $derived(data.sessions as unknown as SessionRow[])
	const playlists = $derived(data.playlists as unknown as PlaylistRow[])
	const stats = $derived(data.stats as Stats | null)
	const nextEvent = $derived(data.nextEvent as NextEvent | null)

	const firstName = $derived((data as any).user?.name?.split(' ')[0] ?? 'vous')

	function formatDate(d: string | Date) {
		return formatDateOnly(d, { weekday: 'short', day: 'numeric', month: 'short' })
	}

	function formatShortDate(d: string | Date) {
		return new Date(toDateOnly(d) || d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
	}

	const eventTypeLabel: Record<string, string> = {
		repetition: 'Répétition',
		concert: 'Concert',
		indisponibilite: 'Indisponibilité',
	}

	const eventTypeColor: Record<string, string> = {
		repetition: 'var(--color-accent)',
		concert: 'var(--color-green)',
		indisponibilite: 'var(--color-red)',
	}
	const eventTypeColorLight: Record<string, string> = {
		repetition: 'var(--color-accent-light)',
		concert: 'var(--color-green-light)',
		indisponibilite: 'var(--color-red-light)',
	}

	// Activity timeline derived from sessions + playlists
	type ActivityItem = { date: string; label: string; detail: string; color: string }
	const activity = $derived((): ActivityItem[] => {
		const items: ActivityItem[] = []

		for (const s of sessions) {
			items.push({
				date: formatShortDate(s.date),
				label: 'Session',
				detail: [s.location, s.song_titles?.filter(Boolean).slice(0, 2).join(', ')].filter(Boolean).join(' · '),
				color: 'var(--color-accent)',
			})
		}

		for (const p of playlists.slice(0, 2)) {
			if (p.updated_at) {
				items.push({
					date: formatShortDate(p.updated_at),
					label: 'Playlist modifiée',
					detail: p.name,
					color: 'var(--color-blue)',
				})
			}
		}

		items.sort((a, b) => b.date.localeCompare(a.date))
		return items.slice(0, 6)
	})
</script>

<svelte:head>
	<title>Tableau de bord</title>
</svelte:head>

<main>
	<div class="dash-layout">
		<!-- Left column -->
		<div class="dash-left">
			<div class="dash-header">
				<h1>Bonjour {firstName} 👋</h1>
				<a href="/sessions" class="btn btn-primary btn-sm">+ Session</a>
			</div>

			<!-- Stats -->
			{#if stats}
				<div class="stat-row">
					<div class="stat-card">
						<span class="stat-num">{stats.session_count}</span>
						<span class="stat-label">Sessions</span>
					</div>
					<div class="stat-card">
						<span class="stat-num">{stats.recording_count}</span>
						<span class="stat-label">Prises</span>
					</div>
					<div class="stat-card">
						<span class="stat-num">{stats.playlist_count}</span>
						<span class="stat-label">Playlists</span>
					</div>
				</div>
			{/if}

			<!-- Recent sessions -->
			<div class="section-header">
				<h2>Sessions récentes</h2>
				<a href="/sessions" class="link-more">Toutes →</a>
			</div>

			{#if sessions.length === 0}
				<p class="empty">Aucune session pour l'instant.</p>
			{:else}
				<ul class="session-list">
					{#each sessions as s}
						<li>
							<a href="/sessions/{s.id}" class="session-card">
								<div class="session-card-top">
									<span class="session-date">{formatDate(s.date)}</span>
									{#if s.location}
										<span class="session-loc">{s.location}</span>
									{/if}
								</div>
								{#if s.song_titles?.filter(Boolean).length}
									<div class="song-pills">
										{#each s.song_titles.filter(Boolean) as title}
											<span class="song-pill">{title}</span>
										{/each}
									</div>
								{:else}
									<div class="session-count">{s.song_count} morceau{s.song_count > 1 ? 'x' : ''}</div>
								{/if}
							</a>
						</li>
					{/each}
				</ul>
			{/if}

			<!-- Next event -->
			{#if nextEvent}
				<div class="next-event" style="--event-color: {eventTypeColor[nextEvent.type]}; --event-bg: {eventTypeColorLight[nextEvent.type]}">
					<span class="next-event-badge">{eventTypeLabel[nextEvent.type] ?? nextEvent.type}</span>
					<span class="next-event-date">{formatShortDate(nextEvent.date)}</span>
					{#if nextEvent.title}
						<span class="next-event-title">— {nextEvent.title}</span>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Right column: activity timeline -->
		<div class="dash-right">
			<div class="section-header">
				<h2>Activité récente</h2>
				<a href="/playlists" class="link-more">Playlists →</a>
			</div>

			{#if activity().length === 0}
				<p class="empty">Aucune activité.</p>
			{:else}
				<div class="timeline">
					<div class="timeline-line"></div>
					{#each activity() as item}
						<div class="timeline-item">
							<div class="timeline-dot" style="background: {item.color}"></div>
							<div class="timeline-body">
								<div class="timeline-label">{item.label}</div>
								{#if item.detail}
									<div class="timeline-detail">{item.detail}</div>
								{/if}
								<div class="timeline-date">{item.date}</div>
							</div>
						</div>
					{/each}
				</div>
			{/if}

			<!-- Playlists -->
			{#if playlists.length > 0}
				<div class="section-header" style="margin-top: 1.5rem">
					<h2>Playlists</h2>
				</div>
				<ul class="playlist-list">
					{#each playlists.slice(0, 4) as p}
						<li>
							<a href="/playlists/{p.id}" class="playlist-card">
								<span class="playlist-name">{p.name}</span>
								<span class="playlist-meta">{p.item_count} prise{p.item_count > 1 ? 's' : ''}</span>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</div>
</main>

<style>
	main {
		padding: 1.5rem;
		max-width: 900px;
	}

	.dash-layout {
		display: grid;
		grid-template-columns: 1fr 240px;
		gap: 2rem;
		align-items: start;
	}

	/* ─── Header ───────────────────────── */
	.dash-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1rem;
	}

	h1 {
		font-size: 1.2rem;
		margin: 0;
		font-weight: 700;
	}

	/* ─── Stats ────────────────────────── */
	.stat-row {
		display: flex;
		gap: 0.6rem;
		margin-bottom: 1.4rem;
	}

	.stat-card {
		flex: 1;
		background: var(--color-paper);
		border: 1px solid var(--color-border-light);
		border-radius: var(--radius-lg);
		padding: 0.7rem 0.8rem;
		text-align: center;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.stat-num {
		font-size: 1.6rem;
		font-weight: 700;
		color: var(--color-accent);
		line-height: 1;
	}

	.stat-label {
		font-size: 0.72rem;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	/* ─── Section headers ──────────────── */
	.section-header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		margin-bottom: 0.65rem;
	}

	h2 {
		font-size: 0.72rem;
		margin: 0;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
		font-weight: 600;
	}

	.link-more {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		text-decoration: none;
	}

	.link-more:hover { color: var(--color-accent); }

	/* ─── Sessions ─────────────────────── */
	.session-list {
		list-style: none;
		padding: 0;
		margin: 0 0 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}

	.session-card {
		display: block;
		border: 1px solid var(--color-border-light);
		border-radius: var(--radius-lg);
		padding: 0.65rem 0.9rem;
		text-decoration: none;
		color: inherit;
		background: var(--color-bg);
		transition: border-color 0.12s, background 0.12s;
	}

	.session-card:hover {
		border-color: var(--color-accent);
		background: var(--color-paper);
	}

	.session-card-top {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		margin-bottom: 0.3rem;
	}

	.session-date {
		font-weight: 700;
		font-size: 0.88rem;
		text-transform: capitalize;
		color: var(--color-text);
	}

	.session-loc {
		font-size: 0.78rem;
		color: var(--color-text-muted);
	}

	.song-pills {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}

	.song-pill {
		font-size: 0.72rem;
		background: var(--color-accent-light);
		color: var(--color-learning-text);
		border-radius: 20px;
		padding: 1px 8px;
		border: 1px solid var(--color-accent-light);
	}

	.session-count {
		font-size: 0.78rem;
		color: var(--color-text-muted);
	}

	/* ─── Next event ───────────────────── */
	.next-event {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.65rem 0.9rem;
		border: 1px solid var(--event-color);
		border-radius: var(--radius-lg);
		background: var(--event-bg);
		font-size: 0.82rem;
		margin-top: 0.5rem;
	}

	.next-event-badge {
		font-weight: 700;
		color: var(--event-color);
	}

	.next-event-date {
		color: var(--color-text-secondary);
	}

	.next-event-title {
		color: var(--color-text-muted);
	}

	/* ─── Timeline ─────────────────────── */
	.timeline {
		position: relative;
		padding-left: 20px;
	}

	.timeline-line {
		position: absolute;
		left: 5px;
		top: 4px;
		bottom: 4px;
		width: 2px;
		background: var(--color-border);
	}

	.timeline-item {
		position: relative;
		display: flex;
		gap: 10px;
		margin-bottom: 1rem;
	}

	.timeline-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		border: 2px solid var(--color-ink);
		position: absolute;
		left: -20px;
		top: 3px;
		flex-shrink: 0;
		z-index: 1;
	}

	.timeline-body {
		display: flex;
		flex-direction: column;
		gap: 1px;
		min-width: 0;
	}

	.timeline-label {
		font-size: 0.82rem;
		font-weight: 700;
		color: var(--color-text);
	}

	.timeline-detail {
		font-size: 0.76rem;
		color: var(--color-text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.timeline-date {
		font-size: 0.7rem;
		color: var(--color-border);
	}

	/* ─── Playlists ────────────────────── */
	.playlist-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.playlist-card {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.55rem 0.75rem;
		border: 1px solid var(--color-border-light);
		border-radius: var(--radius-md);
		text-decoration: none;
		color: inherit;
		background: var(--color-bg);
		transition: border-color 0.12s;
	}

	.playlist-card:hover { border-color: var(--color-accent); }

	.playlist-name {
		font-size: 0.82rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.playlist-meta {
		font-size: 0.73rem;
		color: var(--color-text-muted);
		white-space: nowrap;
	}

	/* ─── Responsive ───────────────────── */
	@media (max-width: 700px) {
		main { padding: 1rem; }
		.dash-layout { grid-template-columns: 1fr; }
		.dash-right { border-top: 1px solid var(--color-border-light); padding-top: 1.5rem; }
	}
</style>
