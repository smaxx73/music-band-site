<script lang="ts">
	import type { PageData } from './$types'
	import { onMount, untrack } from 'svelte'
	import { formatDateOnly } from '$lib/date'
	import { formatBytes, isSuperadmin } from '$lib/types'
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte'

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
	let pendingDelete = $state<{ id: number; label: string } | null>(null)

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

	function diskPercent(used: number, total: number) {
		if (!total) return 0
		return Math.round((used / total) * 100)
	}

	async function deleteRecording() {
		if (!pendingDelete) return
		const { id } = pendingDelete
		pendingDelete = null
		deletingId = id
		deleteError = null
		try {
			const res = await fetch(`/api/recordings/${id}`, { method: 'DELETE' })
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

<main class="page page-wide">
	<nav class="breadcrumb">
		<a href="/">Tableau de bord</a> /
		<span>Administration</span>
	</nav>

	<h1>Administration</h1>

	<!-- Actions rapides -->
	<section class="section">
		<h2 class="section-title">Actions</h2>
		<div class="actions-row">
			<a href="/admin/groups" class="btn btn-secondary">Gérer les groupes</a>
			<a href="/admin/users" class="btn btn-secondary">Gérer les utilisateurs</a>
			<a href="/admin/settings" class="btn btn-secondary">Paramètres</a>
			{#if isSuperadmin(data.user?.role)}
				<a href="/admin/partition" class="btn btn-secondary">Feuilles de répétition</a>
			{/if}
			<a href="/api/admin/backup" class="btn btn-secondary" download>
				Télécharger la sauvegarde SQL
			</a>
		</div>
	</section>

	<!-- Statistiques -->
	<section class="section">
		<h2 class="section-title">Statistiques</h2>

		{#if statsError}
			<p class="message-error">{statsError}</p>
		{:else if !stats}
			<p class="empty">Chargement…</p>
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
		<h2 class="section-title">10 dernières prises</h2>

		{#if deleteError}
			<p class="message-error">{deleteError}</p>
		{/if}

		{#if recentRecordings.length === 0}
			<p class="empty">Aucune prise.</p>
		{:else}
			<div class="table-scroll">
				<table class="data-table">
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
								<td class="song-cell">
									<a href="/recording/{r.id}">{r.song_title}</a>
								</td>
								<td class="muted">{formatDate(r.session_date)}</td>
								<td class="muted">Prise {r.take}</td>
								<td class="muted" data-label="Par">{r.uploaded_by}</td>
								<td class="actions-cell">
									<button
										class="btn btn-danger btn-sm"
										onclick={() => (pendingDelete = { id: r.id, label: `${r.song_title}, prise ${r.take}` })}
										disabled={deletingId === r.id}
									>
										{deletingId === r.id ? '…' : 'Supprimer'}
									</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>

	<ConfirmDialog
		open={pendingDelete !== null}
		level="danger"
		title="Supprimer cette prise ?"
		message={pendingDelete
			? `« ${pendingDelete.label} » sera supprimée avec son fichier audio, ses commentaires et sa place dans les playlists. Cette action est irréversible.`
			: ''}
		confirmLabel="Supprimer la prise"
		onConfirm={deleteRecording}
		onCancel={() => (pendingDelete = null)}
	/>
</main>

<style>
	h1 { font-size: var(--text-xl); margin: 0 0 1.75rem; }

	.actions-row { display: flex; gap: 0.75rem; flex-wrap: wrap; }

	/* Stats */
	.stats-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
		gap: 0.75rem;
		margin-bottom: 1.25rem;
	}

	.stat-card {
		background: var(--color-bg-subtle);
		border: 1px solid var(--color-border-light);
		border-radius: var(--radius-lg);
		padding: 0.85rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.stat-value {
		font-size: var(--text-xl);
		font-weight: 700;
		line-height: 1;
	}

	.stat-label { font-size: 0.78rem; color: var(--color-text-muted); }

	/* Barre disque */
	.disk-block { margin-top: 0.5rem; }

	.disk-label {
		display: flex;
		justify-content: space-between;
		font-size: 0.8rem;
		color: var(--color-text-secondary);
		margin-bottom: 0.35rem;
	}

	.disk-bar {
		height: 8px;
		background: var(--color-bg-muted);
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.disk-fill {
		height: 100%;
		background: var(--color-ink);
		border-radius: var(--radius-md);
		transition: width 0.4s;
	}

	.disk-fill.disk-warn { background: var(--color-accent); }

	/* Table */
	td a { color: inherit; text-decoration: none; font-weight: 600; }
	td a:hover { text-decoration: underline; }

	.muted { color: var(--color-text-muted); font-size: 0.82rem; }

	/* Sous 640 px le tableau devient une pile de cartes (voir app.css). */
	@media (max-width: 640px) {
		.disk-label { flex-wrap: wrap; gap: 0.2rem; }

		td.song-cell { flex: 1 1 100%; font-size: var(--text-base); font-weight: 600; }
		td.actions-cell { margin-left: auto; }
	}
</style>
