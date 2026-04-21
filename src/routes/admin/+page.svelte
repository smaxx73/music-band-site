<script lang="ts">
	import type { PageData } from './$types'
	import { onMount, untrack } from 'svelte'
	import { formatDateOnly } from '$lib/date'

	let { data }: { data: PageData } = $props()

	type RecentRecording = {
		id: number; take: number; status: string
		uploaded_by: string; created_at: string
		song_title: string; session_date: string
	}

	type Stats = {
		counts: { songs: number; sessions: number; recordings: number; comments: number; playlists: number }
		audio: { files: number; bytes: number }
		disk: { used: number; available: number; total: number }
	}

	let recentRecordings = $state(untrack(() => data.recentRecordings as unknown as RecentRecording[]))
	let stats = $state<Stats | null>(null)
	let statsError = $state<string | null>(null)

	let deletingId = $state<number | null>(null)
	let deleteError = $state<string | null>(null)

	onMount(async () => {
		try {
			const res = await fetch('/api/admin/stats')
			if (!res.ok) throw new Error('Erreur serveur')
			stats = await res.json()
		} catch {
			statsError = 'Impossible de charger les statistiques.'
		}
	})

	function formatDate(d: string | Date) {
		return formatDateOnly(d, {
			day: 'numeric', month: 'short', year: 'numeric'
		})
	}

	function formatBytes(b: number) {
		if (b === 0) return '0 o'
		const units = ['o', 'Ko', 'Mo', 'Go']
		const i = Math.floor(Math.log(b) / Math.log(1024))
		return `${(b / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
	}

	function diskPercent(used: number, total: number) {
		if (!total) return 0
		return Math.round((used / total) * 100)
	}

	async function deleteRecording(id: number, label: string) {
		if (!confirm(`Supprimer "${label}" ? Cette action est irréversible.`)) return

		deletingId = id
		deleteError = null
		try {
			const res = await fetch(`/api/admin/recordings/${id}`, { method: 'DELETE' })
			const json = await res.json()
			if (!res.ok) { deleteError = json.error ?? 'Erreur.'; return }
			recentRecordings = recentRecordings.filter((r) => r.id !== id)
			// Rafraîchir les stats
			const sres = await fetch('/api/admin/stats')
			if (sres.ok) stats = await sres.json()
		} catch {
			deleteError = 'Erreur réseau.'
		} finally {
			deletingId = null
		}
	}
</script>

<svelte:head>
	<title>Administration</title>
</svelte:head>

<main>
	<nav class="breadcrumb">
		<a href="/">Tableau de bord</a> /
		<span>Administration</span>
	</nav>

	<h1>Administration</h1>

	<!-- Actions rapides -->
	<section class="section">
		<h2>Actions</h2>
		<div class="actions-row">
			<a href="/admin/songs" class="btn-secondary">Gérer les morceaux</a>
			<a href="/admin/users" class="btn-secondary">Gérer les utilisateurs</a>
			<a href="/admin/settings" class="btn-secondary">Paramètres</a>
			<a href="/api/admin/backup" class="btn-secondary" download>
				Télécharger la sauvegarde SQL
			</a>
		</div>
	</section>

	<!-- Statistiques -->
	<section class="section">
		<h2>Statistiques</h2>

		{#if statsError}
			<p class="error">{statsError}</p>
		{:else if !stats}
			<p class="loading">Chargement…</p>
		{:else}
			<div class="stats-grid">
				<div class="stat-card">
					<span class="stat-value">{stats.counts.songs}</span>
					<span class="stat-label">Morceaux</span>
				</div>
				<div class="stat-card">
					<span class="stat-value">{stats.counts.sessions}</span>
					<span class="stat-label">Sessions</span>
				</div>
				<div class="stat-card">
					<span class="stat-value">{stats.counts.recordings}</span>
					<span class="stat-label">Prises</span>
				</div>
				<div class="stat-card">
					<span class="stat-value">{stats.counts.comments}</span>
					<span class="stat-label">Commentaires</span>
				</div>
				<div class="stat-card">
					<span class="stat-value">{stats.counts.playlists}</span>
					<span class="stat-label">Playlists</span>
				</div>
				<div class="stat-card">
					<span class="stat-value">{formatBytes(stats.audio.bytes)}</span>
					<span class="stat-label">{stats.audio.files} fichier{stats.audio.files > 1 ? 's' : ''} audio</span>
				</div>
			</div>

			{#if stats.disk.total > 0}
				<div class="disk-block">
					<div class="disk-label">
						<span>Disque</span>
						<span>{formatBytes(stats.disk.used)} utilisés / {formatBytes(stats.disk.total)} — {formatBytes(stats.disk.available)} disponibles</span>
					</div>
					<div class="disk-bar">
						<div
							class="disk-fill"
							class:disk-warn={diskPercent(stats.disk.used, stats.disk.total) > 80}
							style="width: {diskPercent(stats.disk.used, stats.disk.total)}%"
						></div>
					</div>
				</div>
			{/if}
		{/if}
	</section>

	<!-- 10 dernières prises -->
	<section class="section">
		<h2>10 dernières prises</h2>

		{#if deleteError}
			<p class="error">{deleteError}</p>
		{/if}

		{#if recentRecordings.length === 0}
			<p class="empty">Aucune prise.</p>
		{:else}
			<table>
				<thead>
					<tr>
						<th>Morceau</th>
						<th>Session</th>
						<th>Prise</th>
						<th>Par</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each recentRecordings as r}
						<tr>
							<td>
								<a href="/recording/{r.id}">{r.song_title}</a>
							</td>
							<td class="muted">{formatDate(r.session_date)}</td>
							<td class="muted">Prise {r.take}</td>
							<td class="muted">{r.uploaded_by}</td>
							<td>
								<button
									class="btn-delete"
									onclick={() => deleteRecording(r.id, `${r.song_title} — Prise ${r.take}`)}
									disabled={deletingId === r.id}
								>
									{deletingId === r.id ? '…' : 'Supprimer'}
								</button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</section>
</main>

<style>
	main {
		max-width: 820px;
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

	h1 { font-size: 1.5rem; margin: 0 0 1.75rem; }

	.section { margin-bottom: 2.5rem; }

	h2 {
		font-size: 1rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: #888;
		margin: 0 0 1rem;
		padding-bottom: 0.4rem;
		border-bottom: 1px solid #ebebeb;
	}

	/* Actions */
	.actions-row { display: flex; gap: 0.75rem; flex-wrap: wrap; }

	.btn-secondary {
		display: inline-block;
		padding: 0.5rem 1rem;
		border: 1px solid #ccc;
		border-radius: 4px;
		text-decoration: none;
		font-size: 0.875rem;
		color: inherit;
		cursor: pointer;
		background: white;
	}

	.btn-secondary:hover { background: #f4f4f4; }

	/* Stats */
	.stats-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
		gap: 0.75rem;
		margin-bottom: 1.25rem;
	}

	.stat-card {
		background: #f8f8f8;
		border: 1px solid #ebebeb;
		border-radius: 6px;
		padding: 0.85rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.stat-value {
		font-size: 1.5rem;
		font-weight: 700;
		color: #1a1a1a;
		line-height: 1;
	}

	.stat-label { font-size: 0.78rem; color: #888; }

	/* Barre disque */
	.disk-block { margin-top: 0.5rem; }

	.disk-label {
		display: flex;
		justify-content: space-between;
		font-size: 0.8rem;
		color: #666;
		margin-bottom: 0.35rem;
	}

	.disk-bar {
		height: 8px;
		background: #ebebeb;
		border-radius: 4px;
		overflow: hidden;
	}

	.disk-fill {
		height: 100%;
		background: #1a1a1a;
		border-radius: 4px;
		transition: width 0.4s;
	}

	.disk-fill.disk-warn { background: #e67e22; }

	/* Table */
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

	td a { color: inherit; text-decoration: none; font-weight: 600; }
	td a:hover { text-decoration: underline; }

	.muted { color: #888; font-size: 0.82rem; }

	.btn-delete {
		padding: 0.2rem 0.55rem;
		border: 1px solid #f0c0c0;
		border-radius: 3px;
		background: #fff5f5;
		color: #c0392b;
		font-size: 0.78rem;
		cursor: pointer;
	}

	.btn-delete:hover:not(:disabled) { background: #ffe0e0; }
	.btn-delete:disabled { opacity: 0.5; cursor: not-allowed; }

	.loading { color: #aaa; font-style: italic; font-size: 0.9rem; }
	.empty { color: #aaa; font-style: italic; font-size: 0.9rem; }
	.error { color: #c0392b; font-size: 0.875rem; }
</style>
