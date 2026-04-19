<script lang="ts">
	import type { PageData } from './$types'

	let { data }: { data: PageData } = $props()

	const STATUS_LABELS: Record<string, string> = {
		en_apprentissage: 'En apprentissage',
		au_repertoire: 'Au répertoire'
	}
</script>

<svelte:head>
	<title>Morceaux</title>
</svelte:head>

<main>
	<h1>Morceaux</h1>

	{#if data.songs.length === 0}
		<p class="empty">Aucun morceau pour l'instant.</p>
	{:else}
		<table>
			<thead>
				<tr>
					<th>Titre</th>
					<th>Compositeur</th>
					<th>Tonalité</th>
					<th>Statut</th>
				</tr>
			</thead>
			<tbody>
				{#each data.songs as song (song.id)}
					<tr>
						<td class="title">
							<a href="/songs/{song.id}">{song.title}</a>
						</td>
						<td>{song.composer ?? '—'}</td>
						<td>{song.key ?? '—'}</td>
						<td>
							<span class="badge badge-{song.status}">
								{STATUS_LABELS[song.status] ?? song.status}
							</span>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</main>

<style>
	main {
		max-width: 700px;
		margin: 2rem auto;
		padding: 0 1rem;
		font-family: sans-serif;
	}

	h1 {
		font-size: 1.5rem;
		margin-bottom: 1.5rem;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.9rem;
	}

	th {
		text-align: left;
		padding: 0.5rem 0.75rem;
		border-bottom: 2px solid #e0e0e0;
		font-size: 0.75rem;
		text-transform: uppercase;
		color: #666;
	}

	td {
		padding: 0.65rem 0.75rem;
		border-bottom: 1px solid #f0f0f0;
	}

	td.title a {
		font-weight: 600;
		color: inherit;
		text-decoration: none;
	}

	td.title a:hover {
		text-decoration: underline;
	}

	.badge {
		display: inline-block;
		padding: 0.2rem 0.5rem;
		border-radius: 3px;
		font-size: 0.75rem;
		font-weight: 600;
	}

	.badge-en_apprentissage {
		background: #dbeafe;
		color: #1e40af;
	}

	.badge-au_repertoire {
		background: #dcfce7;
		color: #166534;
	}

	.empty {
		color: #888;
		font-style: italic;
	}
</style>
