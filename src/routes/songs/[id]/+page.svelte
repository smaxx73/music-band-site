<script lang="ts">
	import type { PageData } from './$types'
	import { formatDateOnly } from '$lib/date'

	let { data }: { data: PageData } = $props()

	type Song = {
		id: number; title: string; composer: string | null
		key: string | null; status: string
	}
	type RecordingRow = {
		id: number; take: number; status: string; notes: string | null
		duration_s: number | null; uploaded_by: string
		session_id: number; session_date: string; session_location: string | null
		comment_count: number
	}

	const song = $derived(data.song as unknown as Song)
	const recordings = $derived(data.recordings as unknown as RecordingRow[])

	const SONG_STATUS_LABELS: Record<string, string> = {
		en_apprentissage: 'En apprentissage',
		au_repertoire: 'Au répertoire',
		abandonne: 'Abandonné'
	}

	const REC_STATUS_LABELS: Record<string, string> = {
		en_cours: 'En cours',
		au_point: 'Au point',
		repertoire: 'Répertoire'
	}

	function formatDate(d: string | Date) {
		return formatDateOnly(d, {
			day: 'numeric', month: 'long', year: 'numeric'
		})
	}

	function formatDuration(s: number | null) {
		if (!s) return '—'
		const m = Math.floor(s / 60)
		const sec = s % 60
		return `${m}:${String(sec).padStart(2, '0')}`
	}

	// Group recordings by session date for display
	type SessionGroup = { session_id: number; session_date: string; session_location: string | null; recordings: RecordingRow[] }

	const sessionGroups = $derived(() => {
		const map = new Map<number, SessionGroup>()
		for (const r of recordings) {
			if (!map.has(r.session_id)) {
				map.set(r.session_id, {
					session_id: r.session_id,
					session_date: r.session_date,
					session_location: r.session_location,
					recordings: []
				})
			}
			map.get(r.session_id)!.recordings.push(r)
		}
		return Array.from(map.values())
	})
</script>

<svelte:head>
	<title>{song.title} — Historique</title>
</svelte:head>

<main>
	<nav class="breadcrumb">
		<a href="/songs">Morceaux</a> /
		<span>{song.title}</span>
	</nav>

	<div class="song-header">
		<div>
			<h1>
				{song.title}
				{#if song.key}<span class="key">{song.key}</span>{/if}
			</h1>
			{#if song.composer}
				<p class="composer">{song.composer}</p>
			{/if}
		</div>
		<span class="status-badge status-{song.status}">
			{SONG_STATUS_LABELS[song.status] ?? song.status}
		</span>
	</div>

	{#if recordings.length === 0}
		<p class="empty">Aucune prise pour ce morceau. <a href="/upload">Uploader →</a></p>
	{:else}
		<p class="summary">{recordings.length} prise{recordings.length > 1 ? 's' : ''} au total</p>

		{#each sessionGroups() as group}
			<section class="session-section">
				<h2>
					<a href="/sessions/{group.session_id}">{formatDate(group.session_date)}</a>
					{#if group.session_location}
						<span class="location">— {group.session_location}</span>
					{/if}
				</h2>

				<table>
					<thead>
						<tr>
							<th>Prise</th>
							<th>Durée</th>
							<th>Statut</th>
							<th>Commentaires</th>
							<th>Par</th>
							<th></th>
						</tr>
					</thead>
					<tbody>
						{#each group.recordings as r}
							<tr>
								<td class="take">Prise {r.take}</td>
								<td>{formatDuration(r.duration_s)}</td>
								<td>
									<span class="badge badge-{r.status}">
										{REC_STATUS_LABELS[r.status] ?? r.status}
									</span>
								</td>
								<td class="center">
									{#if r.comment_count > 0}
										<span class="comment-count">{r.comment_count}</span>
									{:else}
										<span class="muted">—</span>
									{/if}
								</td>
								<td class="muted">{r.uploaded_by}</td>
								<td>
									<a href="/recording/{r.id}" class="btn-listen">Écouter</a>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</section>
		{/each}
	{/if}
</main>

<style>
	main {
		max-width: 760px;
		margin: 2rem auto;
		padding: 0 1rem;
		font-family: sans-serif;
	}

	.breadcrumb {
		font-size: 0.85rem;
		color: #888;
		margin-bottom: 1.25rem;
	}

	.breadcrumb a { color: inherit; text-decoration: none; }
	.breadcrumb a:hover { text-decoration: underline; }

	.song-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1.75rem;
	}

	h1 {
		font-size: 1.5rem;
		margin: 0 0 0.25rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.key {
		font-size: 0.85rem;
		font-weight: 400;
		background: #f3f4f6;
		color: #555;
		padding: 0.15rem 0.45rem;
		border-radius: 3px;
	}

	.composer {
		font-size: 0.9rem;
		color: #666;
		margin: 0;
	}

	.status-badge {
		flex-shrink: 0;
		display: inline-block;
		padding: 0.25rem 0.6rem;
		border-radius: 4px;
		font-size: 0.75rem;
		font-weight: 700;
	}

	.status-en_apprentissage { background: #fef3c7; color: #92400e; }
	.status-au_repertoire    { background: #dcfce7; color: #166534; }
	.status-abandonne        { background: #f3f4f6; color: #888; }

	.summary {
		font-size: 0.875rem;
		color: #888;
		margin: 0 0 1.5rem;
	}

	.session-section {
		margin-bottom: 2rem;
	}

	h2 {
		font-size: 1.05rem;
		margin: 0 0 0.75rem;
	}

	h2 a { color: inherit; text-decoration: none; }
	h2 a:hover { text-decoration: underline; }

	.location {
		font-weight: 400;
		color: #777;
		font-size: 0.9rem;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.875rem;
	}

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

	td.take { font-weight: 600; color: #555; }
	td.center { text-align: center; }

	.muted { color: #aaa; font-size: 0.8rem; }

	.badge {
		display: inline-block;
		padding: 0.18rem 0.45rem;
		border-radius: 3px;
		font-size: 0.72rem;
		font-weight: 700;
	}

	.badge-en_cours   { background: #fef3c7; color: #92400e; }
	.badge-au_point   { background: #dbeafe; color: #1e40af; }
	.badge-repertoire { background: #dcfce7; color: #166534; }

	.comment-count {
		display: inline-block;
		background: #f3f4f6;
		color: #444;
		border-radius: 10px;
		padding: 0.1rem 0.5rem;
		font-size: 0.75rem;
		font-weight: 600;
	}

	.btn-listen {
		display: inline-block;
		padding: 0.25rem 0.6rem;
		border: 1px solid #ccc;
		border-radius: 4px;
		font-size: 0.78rem;
		text-decoration: none;
		color: inherit;
	}

	.btn-listen:hover { background: #f4f4f4; }

	.empty { color: #888; font-style: italic; }
</style>
