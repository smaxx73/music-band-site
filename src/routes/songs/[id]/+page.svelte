<script lang="ts">
	import type { PageData } from './$types'
	import { formatDateOnly } from '$lib/date'
	import SongDetails from '$lib/components/SongDetails.svelte'

	let { data }: { data: PageData } = $props()

	type Song = {
		id: number; title: string; composer: string | null
		key: string | null; lyrics: string | null
		music_notes: string | null; status: string
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
		<span class="badge badge-{song.status}">
			{SONG_STATUS_LABELS[song.status] ?? song.status}
		</span>
	</div>

	<SongDetails lyrics={song.lyrics} musicNotes={song.music_notes} />

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

				<table class="data-table">
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
									<a href="/recording/{r.id}" class="btn btn-secondary btn-sm">Écouter</a>
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
	}

	.song-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1.75rem;
	}

	h1 {
		font-size: var(--text-xl);
		margin: 0 0 0.25rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.key {
		font-size: 0.85rem;
		font-weight: 400;
		background: var(--color-abandoned-bg);
		color: var(--color-text-secondary);
		padding: 0.15rem 0.45rem;
		border-radius: var(--radius-sm);
	}

	.composer { font-size: 0.9rem; color: #666; margin: 0; }

	.summary { font-size: var(--text-sm); color: var(--color-text-muted); margin: 0 0 1.5rem; }

	.session-section { margin-bottom: 2rem; }

	h2 { font-size: 1.05rem; margin: 0 0 0.75rem; }
	h2 a { color: inherit; text-decoration: none; }
	h2 a:hover { text-decoration: underline; }

	.location { font-weight: 400; color: #777; font-size: 0.9rem; }

	td.take { font-weight: 600; color: var(--color-text-secondary); }
	td.center { text-align: center; }
	.muted { color: #aaa; font-size: 0.8rem; }

	.comment-count {
		display: inline-block;
		background: var(--color-abandoned-bg);
		color: #444;
		border-radius: 10px;
		padding: 0.1rem 0.5rem;
		font-size: var(--text-xs);
		font-weight: 600;
	}
</style>
