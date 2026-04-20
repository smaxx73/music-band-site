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
		<table class="data-table">
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
	}

	h1 {
		font-size: var(--text-xl);
		margin-bottom: 1.5rem;
	}

	td.title a {
		font-weight: 600;
		color: inherit;
		text-decoration: none;
	}

	td.title a:hover {
		text-decoration: underline;
	}
</style>
