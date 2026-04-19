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

	const STATUS_LABELS: Record<string, string> = {
		en_cours: 'En cours',
		au_point: 'Au point',
		repertoire: 'Répertoire'
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

	// Inline editing
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
			// Update local state
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

				<table>
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

	h1 {
		font-size: 1.5rem;
		margin: 0;
		text-transform: capitalize;
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

	/* Inline status select */
	.status-select {
		border: 1px solid #e0e0e0;
		border-radius: 3px;
		font-size: 0.72rem;
		font-weight: 700;
		padding: 0.18rem 0.45rem;
		cursor: pointer;
		background: white;
		appearance: none;
	}

	.status-select:disabled { opacity: 0.6; cursor: not-allowed; }

	.status-select.status-en_cours   { background: #fef3c7; color: #92400e; border-color: #fde68a; }
	.status-select.status-au_point   { background: #dbeafe; color: #1e40af; border-color: #bfdbfe; }
	.status-select.status-repertoire { background: #dcfce7; color: #166534; border-color: #bbf7d0; }

	.save-error { display: block; font-size: 0.72rem; color: #c0392b; margin-top: 0.2rem; }

	/* Inline notes editing */
	.notes-cell { min-width: 140px; max-width: 220px; }

	.notes-display {
		background: none;
		border: 1px solid transparent;
		border-radius: 3px;
		padding: 0.2rem 0.35rem;
		font-size: 0.85rem;
		color: #444;
		cursor: pointer;
		text-align: left;
		width: 100%;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.notes-display:hover { border-color: #ddd; background: #fafafa; }

	.notes-edit { display: flex; flex-direction: column; gap: 0.25rem; }

	.notes-edit textarea {
		font-size: 0.85rem;
		font-family: inherit;
		padding: 0.3rem 0.4rem;
		border: 1px solid #bbb;
		border-radius: 3px;
		resize: vertical;
		width: 100%;
		box-sizing: border-box;
	}

	.notes-actions { display: flex; gap: 0.25rem; }

	.btn-save {
		padding: 0.15rem 0.5rem;
		background: #1a1a1a;
		color: white;
		border: none;
		border-radius: 3px;
		font-size: 0.78rem;
		cursor: pointer;
	}

	.btn-save:disabled { opacity: 0.5; cursor: not-allowed; }

	.btn-cancel {
		padding: 0.15rem 0.4rem;
		background: none;
		border: 1px solid #ccc;
		border-radius: 3px;
		font-size: 0.78rem;
		cursor: pointer;
		color: #888;
	}

	.btn-cancel:hover:not(:disabled) { background: #f4f4f4; }
</style>
