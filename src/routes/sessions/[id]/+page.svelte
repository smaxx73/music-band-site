<script lang="ts">
	import type { PageData } from './$types'
	import { formatDateOnly } from '$lib/date'
	import SessionEditor from '$lib/components/SessionEditor.svelte'

	let { data }: { data: PageData } = $props()

	type Song = { id: number; title: string; composer: string | null; status: string }
	type RecordingRow = {
		id: number; take: number; status: string; notes: string | null
		duration_s: number | null; uploaded_by: string; comment_count: number; file_path: string
	}
	type Group = { song: Song; recordings: RecordingRow[] }

	type SessionData = {
		id: number; date: string; location: string | null
		notes: string | null; members: string[]
	}

	let session = $state(data.session as unknown as SessionData)
	let groups = $state(data.groups as unknown as Group[])

	let sessionSaving = $state(false)
	let sessionError = $state<string | null>(null)

	async function saveSession(patch: {
		date: string
		location: string | null
		members: string[]
		notes: string | null
	}) {
		sessionSaving = true
		sessionError = null
		try {
			const res = await fetch(`/api/sessions/${session.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(patch)
			})
			const json = await res.json()
			if (!res.ok) { sessionError = json.error ?? 'Erreur.'; return false }
			session = json as SessionData
			return true
		} catch {
			sessionError = 'Erreur réseau.'
			return false
		} finally {
			sessionSaving = false
		}
	}

	function formatDate(d: string | Date) {
		return formatDateOnly(d, {
			weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
		})
	}

	function formatDuration(s: number | null) {
		if (!s) return '—'
		const m = Math.floor(s / 60)
		const sec = s % 60
		return `${m}:${String(sec).padStart(2, '0')}`
	}

	let editingNotes = $state<Record<number, string>>({})
	let savingId = $state<number | null>(null)
	let saveError = $state<Record<number, string>>({})

	function startEditNotes(r: RecordingRow) {
		editingNotes[r.id] = r.notes ?? ''
	}

	function cancelEditNotes(id: number) {
		delete editingNotes[id]
		editingNotes = { ...editingNotes }
	}

	async function patchRecording(id: number, patch: Record<string, unknown>) {
		savingId = id
		delete saveError[id]
		saveError = { ...saveError }
		try {
			const res = await fetch(`/api/recordings/${id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(patch)
			})
			const json = await res.json()
			if (!res.ok) {
				saveError = { ...saveError, [id]: json.error ?? 'Erreur.' }
				return
			}
			groups = groups.map((g) => ({
				...g,
				recordings: g.recordings.map((r) =>
					r.id === id ? { ...r, status: json.status, notes: json.notes } : r
				)
			}))
		} catch {
			saveError = { ...saveError, [id]: 'Erreur réseau.' }
		} finally {
			savingId = null
		}
	}

	async function onStatusChange(r: RecordingRow, e: Event) {
		const value = (e.target as HTMLSelectElement).value
		await patchRecording(r.id, { status: value })
	}

	async function saveNotes(id: number) {
		const notes = editingNotes[id] ?? ''
		await patchRecording(id, { notes: notes.trim() || null })
		cancelEditNotes(id)
	}
</script>

<svelte:head>
	<title>Session du {formatDate(session.date)}</title>
</svelte:head>

<main>
	<nav class="breadcrumb">
		<a href="/sessions">Sessions</a> /
		<span>{formatDate(session.date)}</span>
	</nav>

	<SessionEditor
		session={session}
		saving={sessionSaving}
		error={sessionError}
		onSave={saveSession}
	/>

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

				<table class="data-table">
					<thead>
						<tr>
							<th>Prise</th>
							<th>Durée</th>
							<th>Statut</th>
							<th>Notes</th>
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
									<select
										class="status-select status-{r.status}"
										value={r.status}
										disabled={savingId === r.id}
										onchange={(e) => onStatusChange(r, e)}
									>
										<option value="en_cours">En cours</option>
										<option value="au_point">Au point</option>
										<option value="repertoire">Répertoire</option>
									</select>
									{#if saveError[r.id]}
										<span class="save-error">{saveError[r.id]}</span>
									{/if}
								</td>
								<td class="notes-cell">
									{#if r.id in editingNotes}
										<div class="notes-edit">
											<textarea
												rows="2"
												bind:value={editingNotes[r.id]}
												disabled={savingId === r.id}
											></textarea>
											<div class="notes-actions">
												<button
													class="btn-save"
													onclick={() => saveNotes(r.id)}
													disabled={savingId === r.id}
												>
													{savingId === r.id ? '…' : 'OK'}
												</button>
												<button
													class="btn-cancel"
													onclick={() => cancelEditNotes(r.id)}
													disabled={savingId === r.id}
												>✕</button>
											</div>
										</div>
									{:else}
										<button
											class="notes-display"
											onclick={() => startEditNotes(r)}
											title="Cliquer pour modifier"
										>
											{#if r.notes}
												{r.notes}
											{:else}
												<span class="muted">—</span>
											{/if}
										</button>
									{/if}
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

	<div class="footer-actions">
		<a href="/upload" class="btn btn-secondary">+ Ajouter une prise</a>
	</div>
</main>

<style>
	main {
		max-width: 760px;
		margin: 2rem auto;
		padding: 0 1rem;
	}

	.song-section { margin-bottom: 2rem; }

	h2 { font-size: var(--text-lg); margin: 0 0 0.75rem; }
	h2 a { color: inherit; text-decoration: none; }
	h2 a:hover { text-decoration: underline; }

	h2 a { color: inherit; text-decoration: none; }
	h2 a:hover { text-decoration: underline; }

	.composer { font-weight: 400; color: #777; font-size: 0.9rem; }

	td.take { font-weight: 700; color: var(--color-text-secondary); }
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

	.footer-actions { margin-top: 2rem; }

	/* Select de statut coloré inline */
	.status-select {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: 0.72rem;
		font-weight: 700;
		padding: 0.18rem 0.45rem;
		cursor: pointer;
		background: var(--color-bg);
		appearance: none;
	}

	.status-select:disabled { opacity: var(--disabled-opacity); cursor: not-allowed; }

	.status-select.status-en_cours   { background: var(--color-progress-bg); color: var(--color-progress-text); border-color: #fde68a; }
	.status-select.status-au_point   { background: var(--color-learning-bg); color: var(--color-learning-text); border-color: #bfdbfe; }
	.status-select.status-repertoire { background: var(--color-repertoire-bg); color: var(--color-repertoire-text); border-color: #bbf7d0; }

	.save-error { display: block; font-size: 0.72rem; color: var(--color-error); margin-top: 0.2rem; }

	/* Édition inline des notes */
	.notes-cell { min-width: 140px; max-width: 220px; }

	.notes-display {
		background: none;
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		padding: 0.2rem 0.35rem;
		font-size: 0.85rem;
		color: #444;
		cursor: pointer;
		text-align: left;
		width: 100%;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.notes-display:hover { border-color: #ddd; background: var(--color-bg-subtle); }

	.notes-edit { display: flex; flex-direction: column; gap: var(--space-1); }

	.notes-edit textarea {
		font-size: 0.85rem;
		font-family: inherit;
		padding: 0.3rem 0.4rem;
		border: 1px solid #bbb;
		border-radius: var(--radius-sm);
		resize: vertical;
		width: 100%;
		box-sizing: border-box;
	}

	.notes-actions { display: flex; gap: var(--space-1); }

	.btn-save {
		padding: 0.15rem 0.5rem;
		background: var(--color-primary);
		color: white;
		border: none;
		border-radius: var(--radius-sm);
		font-size: 0.78rem;
		cursor: pointer;
	}

	.btn-save:disabled { opacity: var(--disabled-opacity); cursor: not-allowed; }

	.btn-cancel {
		padding: 0.15rem 0.4rem;
		background: none;
		border: 1px solid var(--color-border-input);
		border-radius: var(--radius-sm);
		font-size: 0.78rem;
		cursor: pointer;
		color: var(--color-text-muted);
	}

	.btn-cancel:hover:not(:disabled) { background: var(--color-bg-muted); }
</style>
