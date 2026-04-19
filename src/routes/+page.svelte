<script lang="ts">
	import type { PageData } from './$types'

	let { data }: { data: PageData } = $props()

	type SessionRow = {
		id: number; date: string; location: string | null
		members: string[]; song_count: number; song_titles: string[]
	}
	type PlaylistRow = { id: number; name: string; item_count: number; updated_at: string }

	const sessions = $derived(data.sessions as unknown as SessionRow[])
	const playlists = $derived(data.playlists as unknown as PlaylistRow[])

	function formatDate(d: string) {
		return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', {
			weekday: 'short', day: 'numeric', month: 'short'
		})
	}

	function formatUpdatedAt(d: string) {
		return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
	}
</script>

<svelte:head>
	<title>Tableau de bord</title>
</svelte:head>

<main>
	<h1>Répétitions</h1>

	<div class="dashboard">
		<!-- Colonne gauche : dernières sessions -->
		<section>
			<div class="section-header">
				<h2>Sessions récentes</h2>
				<a href="/sessions" class="link-more">Toutes →</a>
			</div>

			{#if sessions.length === 0}
				<p class="empty">Aucune session pour l'instant.</p>
			{:else}
				<ul class="card-list">
					{#each sessions as s}
						<li>
							<a href="/sessions/{s.id}" class="card">
								<div class="card-date">{formatDate(s.date)}</div>
								{#if s.location}
									<div class="card-sub">{s.location}</div>
								{/if}
								{#if s.song_titles?.filter(Boolean).length}
									<div class="card-songs">
										{s.song_titles.filter(Boolean).join(' · ')}
									</div>
								{:else}
									<div class="card-songs muted">{s.song_count} morceau{s.song_count > 1 ? 'x' : ''}</div>
								{/if}
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<!-- Colonne droite : playlists -->
		<section>
			<div class="section-header">
				<h2>Playlists</h2>
				<a href="/playlists" class="link-more">Toutes →</a>
			</div>

			{#if playlists.length === 0}
				<p class="empty">Aucune playlist pour l'instant.</p>
			{:else}
				<ul class="card-list">
					{#each playlists as p}
						<li>
							<a href="/playlists/{p.id}" class="card">
								<div class="card-date">{p.name}</div>
								<div class="card-sub">
									{p.item_count} prise{p.item_count > 1 ? 's' : ''}
									{#if p.updated_at}
										· modifié le {formatUpdatedAt(p.updated_at)}
									{/if}
								</div>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>
</main>

<style>
	main {
		max-width: 880px;
		margin: 2rem auto;
		padding: 0 1rem;
		font-family: sans-serif;
	}

	h1 { font-size: 1.5rem; margin: 0 0 2rem; }

	.dashboard {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 2rem;
	}

	@media (max-width: 600px) {
		.dashboard { grid-template-columns: 1fr; }
	}

	.section-header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		margin-bottom: 0.75rem;
	}

	h2 { font-size: 1rem; margin: 0; text-transform: uppercase; letter-spacing: 0.04em; color: #555; }

	.link-more { font-size: 0.8rem; color: #888; text-decoration: none; }
	.link-more:hover { color: #333; }

	.card-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.5rem; }

	.card {
		display: block;
		border: 1px solid #e8e8e8;
		border-radius: 6px;
		padding: 0.75rem 1rem;
		text-decoration: none;
		color: inherit;
		transition: border-color 0.15s;
	}

	.card:hover { border-color: #bbb; }

	.card-date { font-weight: 700; font-size: 0.9rem; text-transform: capitalize; }
	.card-sub { font-size: 0.78rem; color: #888; margin-top: 0.1rem; }
	.card-songs { font-size: 0.8rem; color: #555; margin-top: 0.3rem; }
	.muted { color: #aaa; }
	.empty { color: #bbb; font-style: italic; font-size: 0.875rem; }
</style>
