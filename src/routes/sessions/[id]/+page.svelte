<script lang="ts">
	import type { PageData } from './$types'
	import { formatDateOnly } from '$lib/date'
	import SessionEditor from '$lib/components/SessionEditor.svelte'
	import SongDetails from '$lib/components/SongDetails.svelte'
	import RecordingRow from '$lib/components/RecordingRow.svelte'
	import { canDeleteGroupContent } from '$lib/types'
	import type { RecordingListItem } from '$lib/types'
	import { invalidateAll } from '$app/navigation'

	let { data }: { data: PageData } = $props()

	type Song = {
		id: number; title: string; composer: string | null
		lyrics: string | null; music_notes: string | null; status: string
	}
	// La vue session ajoute au socle partagé l'auteur du dépôt : c'est lui qui décide
	// du droit de suppression (voir canDeleteGroupContent).
	type SessionRecording = RecordingListItem & { uploaded_by_user_id: number | null }
	type Group = { song: Song; recordings: SessionRecording[] }

	type SessionData = {
		id: number; date: string; type: 'repetition' | 'concert' | 'studio' | 'autre'; title: string | null
		location: string | null; notes: string | null; members: string[]
		created_by_user_id: number | null
	}

	// $derived inscriptible : les mises à jour optimistes locales sont écrasées
	// dès que `data` est rechargé (navigation, invalidation).
	let session = $derived(data.session as unknown as SessionData)
	let groups = $derived(data.groups as unknown as Group[])
	const hasCalendarEvent = $derived(data.hasCalendarEvent as boolean)

	// Mêmes règles qu'à l'API : l'auteur d'un contenu, ou un administrateur du groupe.
	// L'écran n'affiche donc que des actions que le serveur acceptera.
	const canDeleteSession = $derived(
		canDeleteGroupContent(data.user, data.user?.current_group_id, session.created_by_user_id)
	)
	const canDeleteRecording = (r: SessionRecording) =>
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

	// Récapitulatif sous l'en-tête : ce qu'a produit la session, d'un coup d'œil.
	const takeCount = $derived(groups.reduce((n, g) => n + g.recordings.length, 0))
	const totalDurationS = $derived(
		groups.reduce((n, g) => n + g.recordings.reduce((m, r) => m + (r.duration_s ?? 0), 0), 0)
	)

	let sessionSaving = $state(false)
	let sessionError = $state<string | null>(null)
	let addingToAgenda = $state(false)
	let agendaError = $state<string | null>(null)

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
			await invalidateAll()
			return true
		} catch {
			sessionError = 'Erreur réseau.'
			return false
		} finally {
			sessionSaving = false
		}
	}

	async function addToAgenda() {
		addingToAgenda = true
		agendaError = null
		try {
			const res = await fetch('/api/agenda', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					date: session.date,
					type: session.type,
					title: session.title,
					notes: session.notes,
					location: session.location,
					session_id: session.id
				})
			})
			const json = await res.json()
			if (!res.ok) { agendaError = json.error ?? 'Erreur lors de l’ajout à l’agenda.'; return }
			await invalidateAll()
		} catch {
			agendaError = 'Erreur réseau.'
		} finally {
			addingToAgenda = false
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

	// La ligne enregistre elle-même la qualité ; la page n'a qu'à refléter le résultat
	// dans sa copie locale, que `data` réécrasera à la prochaine invalidation.
	function applyQuality(id: number, status: string) {
		groups = groups.map((g) => ({
			...g,
			recordings: g.recordings.map((r) => (r.id === id ? { ...r, status } : r))
		}))
	}

	let editMode = $state(false)
	let deletingRecordingId = $state<number | null>(null)

	async function deleteRecording(id: number, songTitle: string, take: number) {
		if (!confirm(`Supprimer la prise ${take} de « ${songTitle} » ? Cette action est irréversible.`)) return

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

	let deleting = $state(false)
	let deleteError = $state<string | null>(null)

	async function deleteSession() {
		const msg = takeCount > 0
			? `Supprimer cette session et ses ${takeCount} prise(s) ? Cette action est irréversible.`
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
		groupMembers={data.groupMembers as string[]}
		saving={sessionSaving}
		error={sessionError}
		onSave={saveSession}
	/>

	{#if !hasCalendarEvent}
		<div class="agenda-restore">
			<span>Cette session ne figure pas dans l’agenda.</span>
			<button class="btn btn-secondary btn-sm" onclick={addToAgenda} disabled={addingToAgenda}>
				{addingToAgenda ? 'Ajout en cours…' : '＋ Ajouter à l’agenda'}
			</button>
			{#if agendaError}<span class="message-error">{agendaError}</span>{/if}
		</div>
	{/if}

	<!-- Morceaux & prises -->
	{#if groups.length === 0}
		<p class="empty">Aucune prise pour cette session. <a href="/upload?session_id={session.id}">Uploader →</a></p>
	{:else}
		<p class="session-summary">
			{groups.length} morceau{groups.length > 1 ? 'x' : ''} · {takeCount} prise{takeCount > 1 ? 's' : ''}
			{#if totalDurationS > 0} · {formatDuration(totalDurationS)} enregistrées{/if}
		</p>

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
				<div class="recording-list">
					{#each group.recordings as r (r.id)}
						<RecordingRow
							recording={r}
							songId={group.song.id}
							songTitle={group.song.title}
							sessionDate={String(session.date)}
							editableQuality
							{editMode}
							canDelete={canDeleteRecording(r)}
							deleting={deletingRecordingId === r.id}
							onQualityChange={(status) => applyQuality(r.id, status)}
							onDelete={() => deleteRecording(r.id, group.song.title, r.take)}
						/>
					{/each}
				</div>
			</section>
		{/each}
	{/if}

	<div class="footer-actions">
		<a href="/upload?session_id={session.id}" class="btn upload-action">+ Ajouter une prise</a>
		<button class="btn btn-secondary" onclick={() => { editMode = !editMode }}>
			{editMode ? 'Terminer' : 'Modifier les prises'}
		</button>
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
	/* Les prises ne sont plus un tableau à faire tenir : chaque ligne se replie seule.
	   La largeur est donc celle d'un texte confortable, pas celle de huit colonnes. */
	main {
		max-width: 900px;
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

	.agenda-restore {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.6rem;
		margin: 1rem 0;
		padding: 0.65rem 0.8rem;
		border: 1px dashed var(--color-border);
		border-radius: var(--radius-sm);
		color: var(--color-text-secondary);
		font-size: var(--text-sm);
	}

	.session-summary {
		margin: -1rem 0 0.75rem;
		font-size: var(--text-sm);
		color: var(--color-text-muted);
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

	.footer-actions { margin-top: 2rem; display: flex; gap: 0.75rem; align-items: center; }

	/* Même signal visuel que l'action « Uploader » de la navigation. */
	.upload-action {
		background: var(--color-accent);
		border-color: var(--color-accent);
		color: #fff;
		font-weight: 600;
	}

	.upload-action:hover { opacity: 0.88; }

	/* Les prises se replient toutes seules (voir RecordingRow) : il ne reste ici que
	   ce qui entoure la liste. */
	@media (max-width: 640px) {
		main { margin: 1rem auto; padding: 0 0.75rem; }

		.breadcrumb-row {
			flex-direction: column;
			align-items: stretch;
			gap: 0.5rem;
		}

		.breadcrumb { margin-bottom: 0.5rem; }

		.session-nav > * { flex: 1; }
		.agenda-restore { align-items: stretch; }

		.footer-actions {
			flex-wrap: wrap;
			gap: 0.5rem;
		}

		.footer-actions > * { flex: 1 1 45%; }
	}
</style>
