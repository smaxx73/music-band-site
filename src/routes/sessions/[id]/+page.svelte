<script lang="ts">
	import type { PageData } from './$types'
	import { formatDateOnly } from '$lib/date'
	import SessionEditor from '$lib/components/SessionEditor.svelte'
	import SongDetails from '$lib/components/SongDetails.svelte'
	import RecordingComments from '$lib/components/RecordingComments.svelte'
	import InlineRecordingPlayer from '$lib/components/InlineRecordingPlayer.svelte'
	import { player } from '$lib/player.svelte'
	import { canDeleteGroupContent } from '$lib/types'

	let { data }: { data: PageData } = $props()

	type Song = {
		id: number; title: string; composer: string | null
		lyrics: string | null; music_notes: string | null; status: string
	}
	type RecordingRow = {
		id: number; take: number; status: string; notes: string | null
		duration_s: number | null; uploaded_by: string; uploaded_by_user_id: number | null
		comment_count: number; file_path: string
	}
	type Group = { song: Song; recordings: RecordingRow[] }

	type SessionData = {
		id: number; date: string; type: 'repetition' | 'concert' | 'studio' | 'autre'; title: string | null
		location: string | null; notes: string | null; members: string[]
		created_by_user_id: number | null
	}

	// $derived inscriptible : les mises à jour optimistes locales sont écrasées
	// dès que `data` est rechargé (navigation, invalidation).
	let session = $derived(data.session as unknown as SessionData)
	let groups = $derived(data.groups as unknown as Group[])

	// Mêmes règles qu'à l'API : l'auteur d'un contenu, ou un administrateur du groupe.
	// L'écran n'affiche donc que des actions que le serveur acceptera.
	const canDeleteSession = $derived(
		canDeleteGroupContent(data.user, data.user?.current_group_id, session.created_by_user_id)
	)
	const canDeleteRecording = (r: RecordingRow) =>
		canDeleteGroupContent(data.user, data.user?.current_group_id, r.uploaded_by_user_id)

	type AdjacentSession = { id: number; date: string; title: string | null; type: string }
	const prevSession = $derived(data.prevSession as unknown as AdjacentSession | null)
	const nextSession = $derived(data.nextSession as unknown as AdjacentSession | null)

	function shortDate(d: string | Date) {
		return formatDateOnly(d, { day: 'numeric', month: 'short', year: '2-digit' })
	}

	// Ancre de section pour le sommaire des morceaux
	function songAnchor(songId: number) {
		return `song-${songId}`
	}

	function scrollToSong(songId: number) {
		document.getElementById(songAnchor(songId))?.scrollIntoView({
			behavior: 'smooth',
			block: 'start'
		})
	}

	let sessionSaving = $state(false)
	let sessionError = $state<string | null>(null)

	async function saveSession(patch: {
		date: string
		type: 'repetition' | 'concert' | 'studio' | 'autre'
		title: string | null
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

	// Commentaires dépliables : lisibles sans ouvrir le lecteur.
	let openComments = $state<Record<number, boolean>>({})

	function toggleComments(id: number) {
		openComments = { ...openComments, [id]: !openComments[id] }
	}

	// Lecteur dépliable : une seule prise à la fois, sinon plusieurs instances
	// WaveSurfer téléchargent leur mp3 et jouent en même temps.
	let openPlayer = $state<number | null>(null)
	let seekRequest = $state<{ seconds: number; token: number } | null>(null)
	let seekToken = 0

	function togglePlayer(song: Song, r: RecordingRow) {
		seekRequest = null

		// Replier ne coupe pas le son : la barre du bas prend le relais.
		if (openPlayer === r.id) {
			openPlayer = null
			return
		}

		openPlayer = r.id
		player.load(
			{
				recordingId: r.id,
				songId: song.id,
				songTitle: song.title,
				take: r.take,
				sessionDate: String(session.date),
				durationS: r.duration_s
			},
			true
		)
	}

	function seekInPlayer(seconds: number) {
		seekToken += 1
		seekRequest = { seconds, token: seekToken }
	}

	function formatDuration(s: number | null) {
		if (!s) return '—'
		const m = Math.floor(s / 60)
		const sec = s % 60
		return `${m}:${String(sec).padStart(2, '0')}`
	}

	let editingNotes = $state<Record<number, string>>({})
	let customQualityDraft = $state<Record<number, string>>({})
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
				return false
			}
			groups = groups.map((g) => ({
				...g,
				recordings: g.recordings.map((r) =>
					r.id === id ? { ...r, status: json.status, notes: json.notes } : r
				)
			}))
			return true
		} catch {
			saveError = { ...saveError, [id]: 'Erreur réseau.' }
			return false
		} finally {
			savingId = null
		}
	}

	const QUALITY_CLASS: Record<string, string> = {
		'À revoir': 'a-revoir', 'à revoir': 'a-revoir',
		'Moyen': 'moyen', 'moyen': 'moyen',
		'Bon': 'bon', 'bon': 'bon',
		'Référence': 'reference', 'référence': 'reference',
		'en_cours': 'a-revoir', 'au_point': 'bon', 'repertoire': 'reference',
	}
	const QUALITY_OPTIONS = ['À revoir', 'Moyen', 'Bon', 'Référence']

	function qualityClass(q: string) { return QUALITY_CLASS[q] ?? 'custom' }

	function presetQuality(q: string) {
		const normalized = q.trim().toLocaleLowerCase('fr-FR')
		return QUALITY_OPTIONS.find((option) => option.toLocaleLowerCase('fr-FR') === normalized)
			?? ({ en_cours: 'À revoir', au_point: 'Bon', repertoire: 'Référence' }[normalized] ?? null)
	}

	function isCustomQuality(r: RecordingRow) {
		return r.id in customQualityDraft || !presetQuality(r.status)
	}

	async function chooseQuality(r: RecordingRow, e: Event) {
		if (savingId === r.id) return
		const select = e.currentTarget as HTMLSelectElement
		const value = select.value
		if (value === 'custom') {
			customQualityDraft = { ...customQualityDraft, [r.id]: presetQuality(r.status) ? '' : r.status }
			return
		}
		delete customQualityDraft[r.id]
		customQualityDraft = { ...customQualityDraft }
		const saved = await patchRecording(r.id, { status: value })
		if (!saved) select.value = presetQuality(r.status) ?? 'custom'
	}

	async function saveCustomQuality(r: RecordingRow) {
		if (savingId === r.id) return
		const value = (customQualityDraft[r.id] ?? r.status).trim()
		if (!value) {
			saveError = { ...saveError, [r.id]: 'Saisis une qualité.' }
			return
		}
		if (value === r.status) return
		await patchRecording(r.id, { status: value })
	}

	async function saveNotes(id: number) {
		const notes = editingNotes[id] ?? ''
		await patchRecording(id, { notes: notes.trim() || null })
		cancelEditNotes(id)
	}

	let editMode = $state(false)
	let deletingRecordingId = $state<number | null>(null)
	let renumbering = $state(false)

	async function deleteRecording(id: number) {
		deletingRecordingId = id
		try {
			const res = await fetch(`/api/recordings/${id}`, { method: 'DELETE' })
			const json = await res.json()
			if (!res.ok) { alert(json.error ?? 'Erreur.'); return }
			groups = groups
				.map((g) => ({ ...g, recordings: g.recordings.filter((r) => r.id !== id) }))
				.filter((g) => g.recordings.length > 0)
		} catch {
			alert('Erreur réseau.')
		} finally {
			deletingRecordingId = null
		}
	}

	function moveRecording(songId: number, recordingId: number, direction: -1 | 1) {
		groups = groups.map((g) => {
			if (g.song.id !== songId) return g
			const idx = g.recordings.findIndex((r) => r.id === recordingId)
			if (idx === -1) return g
			const newIdx = idx + direction
			if (newIdx < 0 || newIdx >= g.recordings.length) return g
			const recs = [...g.recordings]
			;[recs[idx], recs[newIdx]] = [recs[newIdx], recs[idx]]
			return { ...g, recordings: recs }
		})
	}

	async function renumber() {
		renumbering = true
		try {
			const res = await fetch(`/api/sessions/${session.id}/reorder`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					groups: groups.map((g) => ({
						song_id: g.song.id,
						recording_ids: g.recordings.map((r) => r.id)
					}))
				})
			})
			const json = await res.json()
			if (!res.ok) { alert(json.error ?? 'Erreur.'); return }
			groups = groups.map((g) => ({
				...g,
				recordings: g.recordings.map((r, i) => ({ ...r, take: i + 1 }))
			}))
		} catch {
			alert('Erreur réseau.')
		} finally {
			renumbering = false
		}
	}

	let deleting = $state(false)
	let deleteError = $state<string | null>(null)

	async function deleteSession() {
		const recordingCount = groups.reduce((n, g) => n + g.recordings.length, 0)
		const msg = recordingCount > 0
			? `Supprimer cette session et ses ${recordingCount} prise(s) ? Cette action est irréversible.`
			: 'Supprimer cette session ? Cette action est irréversible.'
		if (!confirm(msg)) return

		deleting = true
		deleteError = null
		try {
			const res = await fetch(`/api/sessions/${session.id}`, { method: 'DELETE' })
			const json = await res.json()
			if (!res.ok) { deleteError = json.error ?? 'Erreur.'; return }
			window.location.href = '/sessions'
		} catch {
			deleteError = 'Erreur réseau.'
		} finally {
			deleting = false
		}
	}
</script>

<svelte:head>
	<title>{session.title ?? formatDate(session.date)}</title>
</svelte:head>

<main>
	<div class="breadcrumb-row">
		<nav class="breadcrumb">
			<a href="/sessions">Sessions</a> /
			<span>{formatDate(session.date)}</span>
		</nav>
		<div class="session-nav">
			{#if prevSession}
				<a
					href="/sessions/{prevSession.id}"
					class="btn btn-secondary btn-sm"
					title="Session précédente : {prevSession.title ?? shortDate(prevSession.date)}"
				>← {shortDate(prevSession.date)}</a>
			{/if}
			{#if nextSession}
				<a
					href="/sessions/{nextSession.id}"
					class="btn btn-secondary btn-sm"
					title="Session suivante : {nextSession.title ?? shortDate(nextSession.date)}"
				>{shortDate(nextSession.date)} →</a>
			{/if}
		</div>
	</div>

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
		{#if groups.length > 1}
			<nav class="song-toc" aria-label="Morceaux de la session">
				{#each groups as group}
					<button class="song-toc-pill" onclick={() => scrollToSong(group.song.id)}>
						{group.song.title}
						<span class="song-toc-count">{group.recordings.length}</span>
					</button>
				{/each}
			</nav>
		{/if}

		{#each groups as group}
			<section class="song-section" id={songAnchor(group.song.id)}>
				<h2>
					<a href="/songs/{group.song.id}">{group.song.title}</a>
					{#if group.song.composer}
						<span class="composer">— {group.song.composer}</span>
					{/if}
				</h2>

				<SongDetails
					lyrics={group.song.lyrics}
					musicNotes={group.song.music_notes}
					compact
				/>
				<table class="data-table">
					<thead>
						<tr>
							<th>Prise</th>
							<th>Durée</th>
							<th>Qualité</th>
							<th>Notes</th>
							<th>Commentaires</th>
							<th>Par</th>
							<th></th>
							{#if editMode}<th></th><th></th>{/if}
						</tr>
					</thead>
					<tbody>
						{#each group.recordings as r}
							<tr>
								<td class="take">#{r.take}</td>
								<td class="duration-cell">{formatDuration(r.duration_s)}</td>
								<td class="quality-cell">
									<select
										class="quality-select quality-{qualityClass(r.status)}"
										value={presetQuality(r.status) ?? 'custom'}
										disabled={savingId === r.id}
										aria-label="Qualité de la prise {r.take}"
										onchange={(e) => chooseQuality(r, e)}
									>
										{#each QUALITY_OPTIONS as option}
											<option value={option}>{option}</option>
										{/each}
										<option value="custom">Autre…</option>
									</select>
									{#if isCustomQuality(r)}
										<div class="custom-quality-control">
											<input
												type="text"
												class="quality-input quality-custom"
												value={customQualityDraft[r.id] ?? r.status}
												placeholder="Libellé personnalisé"
												maxlength="50"
												disabled={savingId === r.id}
												aria-label="Libellé personnalisé pour la prise {r.take}"
												oninput={(e) => (customQualityDraft = { ...customQualityDraft, [r.id]: (e.currentTarget as HTMLInputElement).value })}
												onkeydown={(e) => { if (e.key === 'Enter') saveCustomQuality(r) }}
											/>
											<button class="btn-save" onclick={() => saveCustomQuality(r)} disabled={savingId === r.id}>OK</button>
										</div>
									{/if}
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
								<td class="center comments-cell">
									{#if r.comment_count > 0}
										<button
											class="comment-count"
											class:open={openComments[r.id]}
											onclick={() => toggleComments(r.id)}
											title={openComments[r.id] ? 'Masquer les commentaires' : 'Lire les commentaires'}
										>
											💬 {r.comment_count}
										</button>
									{:else}
										<span class="muted">—</span>
									{/if}
								</td>
								<td class="muted uploader-cell" data-label="Par">{r.uploaded_by}</td>
								<td class="listen-cell">
									<button
										class="btn btn-secondary btn-sm"
										class:btn-active={openPlayer === r.id}
										onclick={() => togglePlayer(group.song, r)}
										title={openPlayer === r.id
											? 'Replier la waveform (la lecture continue en bas)'
											: 'Écouter sans quitter la page'}
									>
										{openPlayer === r.id ? '▲ Réduire' : '▶ Écouter'}
									</button>
								</td>
								{#if editMode}
								<td class="reorder-cell">
									<button
										class="btn-reorder"
										disabled={group.recordings.indexOf(r) === 0}
										onclick={() => moveRecording(group.song.id, r.id, -1)}
										title="Monter">↑</button>
									<button
										class="btn-reorder"
										disabled={group.recordings.indexOf(r) === group.recordings.length - 1}
										onclick={() => moveRecording(group.song.id, r.id, 1)}
										title="Descendre">↓</button>
								</td>
								<td class="delete-cell">
									{#if canDeleteRecording(r)}
									<button
										class="btn btn-danger btn-sm"
										disabled={deletingRecordingId === r.id}
										onclick={() => deleteRecording(r.id)}
									>
										{deletingRecordingId === r.id ? '…' : 'Supprimer'}
									</button>
									{/if}
								</td>
								{/if}
							</tr>
							{#if openPlayer === r.id || openComments[r.id]}
								<tr class="comments-row">
									<td colspan={editMode ? 9 : 7}>
										{#if openPlayer === r.id}
											<InlineRecordingPlayer
												recordingId={r.id}
												durationS={r.duration_s}
												seekRequest={seekRequest}
											/>
										{/if}
										{#if openComments[r.id]}
											<RecordingComments
												recordingId={r.id}
												onSeek={openPlayer === r.id ? seekInPlayer : null}
											/>
										{/if}
									</td>
								</tr>
							{/if}
						{/each}
					</tbody>
				</table>
			</section>
		{/each}
	{/if}

	<div class="footer-actions">
		<a href="/upload" class="btn btn-secondary">+ Ajouter une prise</a>
		<button class="btn btn-secondary" onclick={() => { editMode = !editMode }}>
			{editMode ? 'Terminer' : 'Modifier les prises'}
		</button>
		{#if editMode}
		<button class="btn btn-secondary" onclick={renumber} disabled={renumbering}>
			{renumbering ? '…' : 'Renuméroter'}
		</button>
		{/if}
		{#if canDeleteSession}
		<button class="btn btn-danger" onclick={deleteSession} disabled={deleting}>
			{deleting ? 'Suppression…' : 'Supprimer la session'}
		</button>
		{/if}
	</div>
	{#if deleteError}
		<p class="message-error" style="margin-top: 0.5rem;">{deleteError}</p>
	{/if}
</main>

<style>
	main {
		max-width: 760px;
		margin: 2rem auto;
		padding: 0 1rem;
	}

	.breadcrumb-row {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.session-nav {
		display: flex;
		gap: 0.4rem;
		margin-bottom: 1.25rem;
	}

	/* Sommaire cliquable : évite de scroller une session à plusieurs morceaux */
	.song-toc {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin-bottom: 1.5rem;
	}

	.song-toc-pill {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		background: var(--color-bg-subtle);
		border: 1px solid var(--color-border-light);
		border-radius: 999px;
		padding: 0.25rem 0.65rem;
		font-size: var(--text-xs);
		font-family: inherit;
		color: var(--color-text-secondary);
		cursor: pointer;
		transition: background 0.1s, color 0.1s, border-color 0.1s;
	}

	.song-toc-pill:hover {
		background: var(--color-accent-light);
		border-color: var(--color-accent);
		color: var(--color-accent);
	}

	.song-toc-count {
		font-weight: 700;
		font-size: 0.65rem;
		color: var(--color-text-muted);
	}

	.song-section {
		margin-bottom: 2rem;
		scroll-margin-top: 1rem;
	}

	h2 { font-size: var(--text-lg); margin: 0 0 0.75rem; }
	h2 a { color: var(--color-primary); text-decoration: none; }
	h2 a:hover { text-decoration: underline; }

	.composer { font-weight: 400; color: #777; font-size: 0.9rem; }

	td.take { font-weight: 700; color: var(--color-text-secondary); }
	td.center { text-align: center; }

	.muted { color: #aaa; font-size: 0.8rem; }

	.comment-count {
		display: inline-block;
		background: var(--color-abandoned-bg);
		color: #444;
		border: 1px solid transparent;
		border-radius: 10px;
		padding: 0.1rem 0.5rem;
		font-size: var(--text-xs);
		font-weight: 600;
		cursor: pointer;
	}

	.comment-count:hover { border-color: var(--color-accent); }
	.comment-count.open { border-color: var(--color-accent); background: var(--color-accent-light); }

	/* Même signal visuel que le compteur de commentaires déplié */
	.listen-cell .btn-active { border-color: var(--color-accent); background: var(--color-accent-light); }

	.comments-row > td { background: var(--color-bg-subtle); padding: 0 1rem; }

	.footer-actions { margin-top: 2rem; display: flex; gap: 0.75rem; align-items: center; }

	/* Sélecteur de qualité et libellé personnalisé */
	.quality-select,
	.quality-input {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: 0.72rem;
		font-weight: 700;
		font-family: inherit;
		padding: 0.18rem 0.45rem;
		background: var(--color-bg);
		width: 7.5rem;
	}

	.custom-quality-control {
		display: flex;
		gap: 0.3rem;
		margin-top: 0.35rem;
	}

	.quality-select:disabled,
	.quality-input:disabled { opacity: var(--disabled-opacity); cursor: not-allowed; }

	.quality-select.quality-a-revoir  { background: #fff3cd; color: #7c5a00; border-color: #fde68a; }
	.quality-select.quality-moyen     { background: var(--color-progress-bg); color: var(--color-progress-text); border-color: #fde68a; }
	.quality-select.quality-bon       { background: var(--color-learning-bg); color: var(--color-learning-text); border-color: #bfdbfe; }
	.quality-select.quality-reference { background: var(--color-repertoire-bg); color: var(--color-repertoire-text); border-color: #bbf7d0; }
	.quality-select.quality-custom,
	.quality-input.quality-custom      { background: var(--color-bg-subtle); color: var(--color-text-secondary); }

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

	.reorder-cell { white-space: nowrap; }

	.btn-reorder {
		background: none;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		padding: 0.1rem 0.35rem;
		font-size: 0.78rem;
		cursor: pointer;
		color: var(--color-text-secondary);
		line-height: 1;
	}

	.btn-reorder:hover:not(:disabled) { background: var(--color-bg-subtle); }
	.btn-reorder:disabled { opacity: var(--disabled-opacity); cursor: not-allowed; }

	/* ─── Responsive : chaque prise devient une carte ─── */
	@media (max-width: 640px) {
		main { margin: 1rem auto; padding: 0 0.75rem; }

		.breadcrumb-row {
			flex-direction: column;
			align-items: stretch;
			gap: 0.5rem;
		}

		.breadcrumb { margin-bottom: 0.5rem; }

		.session-nav > * { flex: 1; }

		.data-table,
		.data-table tbody,
		.data-table tr,
		.data-table td {
			display: block;
		}

		.data-table thead { display: none; }

		.data-table tr {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			gap: 0.45rem 0.8rem;
			border: 1px solid var(--color-border-light);
			border-radius: var(--radius-lg);
			padding: 0.7rem 0.75rem;
			margin-bottom: 0.6rem;
		}

		.data-table td {
			border: none;
			padding: 0;
			min-width: 0;
		}

		.data-table td[data-label]::before {
			content: attr(data-label) ' ';
			font-size: var(--text-xs);
			text-transform: uppercase;
			color: var(--color-text-muted);
			margin-right: 0.25rem;
		}

		/* Ligne 1 : prise · durée · auteur — puis notes, puis actions */
		td.take { order: 1; font-size: var(--text-base); }
		td.take::before { content: 'Prise '; font-weight: 400; color: var(--color-text-muted); }
		td.duration-cell { order: 2; font-size: var(--text-sm); color: var(--color-text-secondary); }
		td.uploader-cell { order: 3; margin-left: auto; }

		td.notes-cell { order: 4; flex: 1 1 100%; max-width: none; }
		.notes-display { padding: 0.3rem 0.4rem; border-color: var(--color-border-light); }

		td.quality-cell { order: 5; }
		.quality-select,
		.quality-input { width: 8rem; padding: 0.3rem 0.45rem; font-size: 0.78rem; }

		td.comments-cell { order: 6; text-align: left; }
		.comment-count { padding: 0.25rem 0.6rem; }

		td.listen-cell { order: 7; margin-left: auto; }

		td.reorder-cell { order: 8; flex: 0 0 auto; }
		.btn-reorder { padding: 0.3rem 0.6rem; }
		td.delete-cell { order: 9; margin-left: auto; }

		/* Les commentaires dépliés sortent du cadre de la carte */
		.data-table tr.comments-row {
			display: block;
			border: none;
			border-radius: 0 0 var(--radius-lg) var(--radius-lg);
			padding: 0;
			margin: -0.5rem 0 0.7rem;
		}

		.comments-row > td { padding: 0 0.7rem; border-radius: 0 0 var(--radius-lg) var(--radius-lg); }

		.footer-actions {
			flex-wrap: wrap;
			gap: 0.5rem;
		}

		.footer-actions > * { flex: 1 1 45%; }
	}
</style>
