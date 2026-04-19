<script lang="ts">
	import type { PageData } from './$types'

	let { data }: { data: PageData } = $props()

	type Song = { id: number; title: string; composer: string | null; status: string }
	type RecordingRow = {
		id: number; take: number; status: string; notes: string | null
		duration_s: number | null; uploaded_by: string; comment_count: number; file_path: string
	}
	type Group = { song: Song; recordings: RecordingRow[] }

	const session = $derived(data.session as unknown as {
		id: number; date: string; location: string | null
		notes: string | null; members: string[]
	})
	const groups = $derived(data.groups as unknown as Group[])

	const STATUS_LABELS: Record<string, string> = {
		en_cours: 'En cours',
		au_point: 'Au point',
		repertoire: 'Répertoire'
	}

	function formatDate(d: string) {
		return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', {
			weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
		})
	}

	function formatDuration(s: number | null) {
		if (!s) return '—'
		const m = Math.floor(s / 60)
		const sec = s % 60
		return `${m}:${String(sec).padStart(2, '0')}`
	}
</script>

<svelte:head>
	<title>Session du {session.date}</title>
</svelte:head>

<main>
	<nav class="breadcrumb">
		<a href="/sessions">Sessions</a> /
		<span>{formatDate(session.date)}</span>
	</nav>

	<!-- En-tête session -->
	<div class="session-header">
		<h1>{formatDate(session.date)}</h1>
		{#if session.location}
			<p class="meta">{session.location}</p>
		{/if}
		{#if session.members?.length}
			<p class="meta">Présents : {session.members.join(', ')}</p>
		{/if}
		{#if session.notes}
			<p class="notes">{session.notes}</p>
		{/if}
	</div>

	<!-- Morceaux & prises -->
	{#if groups.length === 0}
		<p class="empty">Aucune prise pour cette session. <a href="/upload">Uploader →</a></p>
	{:else}
		{#each groups as group}
			<section class="song-section">
				<h2>
					<a href="/songs/{group.song.id}">{group.song.title}</a>
					{#if group.song.composer}
						<span class="composer">— {group.song.composer}</span>
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
								<td class="take">#{r.take}</td>
								<td>{formatDuration(r.duration_s)}</td>
								<td>
									<span class="badge badge-{r.status}">
										{STATUS_LABELS[r.status] ?? r.status}
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

	<div class="footer-actions">
		<a href="/upload" class="btn-secondary">+ Ajouter une prise</a>
	</div>
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

	.breadcrumb a {
		color: inherit;
		text-decoration: none;
	}

	.breadcrumb a:hover {
		text-decoration: underline;
	}

	.session-header {
		margin-bottom: 2rem;
	}

	h1 {
		font-size: 1.5rem;
		margin: 0 0 0.4rem;
		text-transform: capitalize;
	}

	.meta {
		font-size: 0.9rem;
		color: #555;
		margin: 0.15rem 0;
	}

	.notes {
		font-size: 0.875rem;
		color: #444;
		background: #f8f8f8;
		border-left: 3px solid #ddd;
		padding: 0.5rem 0.75rem;
		margin-top: 0.75rem;
		border-radius: 0 4px 4px 0;
	}

	.song-section {
		margin-bottom: 2rem;
	}

	h2 {
		font-size: 1.1rem;
		margin: 0 0 0.75rem;
	}

	h2 a {
		color: inherit;
		text-decoration: none;
	}

	h2 a:hover {
		text-decoration: underline;
	}

	.composer {
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

	td.take {
		font-weight: 700;
		color: #555;
	}

	td.center {
		text-align: center;
	}

	.muted {
		color: #aaa;
		font-size: 0.8rem;
	}

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

	.btn-listen:hover {
		background: #f4f4f4;
	}

	.empty {
		color: #888;
		font-style: italic;
	}

	.footer-actions {
		margin-top: 2rem;
	}

	.btn-secondary {
		display: inline-block;
		padding: 0.5rem 1rem;
		border: 1px solid #ccc;
		border-radius: 4px;
		text-decoration: none;
		color: inherit;
		font-size: 0.875rem;
	}

	.btn-secondary:hover {
		background: #f4f4f4;
	}
</style>
