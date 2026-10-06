<script lang="ts">
	import type { PageData } from './$types'
	import { songAlbumArtist } from '$lib/songs'
	import { formatDateOnly } from '$lib/date'
	import SessionEditor from '$lib/components/SessionEditor.svelte'
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte'
	import RecordingRow from '$lib/components/RecordingRow.svelte'
	import SongCover from '$lib/components/SongCover.svelte'
	import PlayAllButton from '$lib/components/PlayAllButton.svelte'
	import type { PlayerTrack } from '$lib/player.svelte'
	import { canDeleteGroupContent, canSharePublicly, formatDurationLong } from '$lib/types'
	import type { RecordingListItem, SessionType } from '$lib/types'
	import { invalidateAll } from '$app/navigation'
	import Icon from '$lib/components/Icon.svelte'

	let { data }: { data: PageData } = $props()

	// La session est du groupe actif : c'est lui l'interprète de chaque morceau.
	const groupName = $derived(data.user?.groups.find((g) => g.id === data.user?.current_group_id)?.name ?? null)

	type Song = {
		id: number; title: string; composer: string | null; original_artist: string | null
		status: string; cover_version: number | null
	}
	// La vue session ajoute au socle partagé l'auteur du dépôt : c'est lui qui décide
	// du droit de suppression (voir canDeleteGroupContent).
	type SessionRecording = RecordingListItem & { uploaded_by_user_id: number | null }
	type Group = { song: Song; recordings: SessionRecording[] }

	type SessionData = {
		id: number; date: string; type: SessionType; title: string | null
		location: string | null; location_lat: number | null; location_lon: number | null
		notes: string | null; members: string[]
		created_by_user_id: number | null
	}

	// $derived inscriptible : les mises à jour optimistes locales sont écrasées
	// dès que `data` est rechargé (navigation, invalidation).
	let session = $derived(data.session as unknown as SessionData)
	let groups = $derived(data.groups as unknown as Group[])
	const hasCalendarEvent = $derived(data.hasCalendarEvent as boolean)
	const allowPublicShare = $derived(
		!!data.user?.current_group_id && canSharePublicly(data.user, { groupId: data.user.current_group_id })
	)

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

	// « Tout écouter » d'un morceau : ses prises avec piste audio, dans l'ordre affiché.
	function groupTracks(group: Group): PlayerTrack[] {
		return group.recordings
			.filter((r) => r.file_path)
			.map((r) => ({
				recordingId: r.id,
				songId: group.song.id,
				songTitle: group.song.title,
				take: r.take,
				sessionDate: String(session.date),
				durationS: r.duration_s
			}))
	}

	function groupDurationS(group: Group) {
		return group.recordings.reduce((n, r) => n + (r.duration_s ?? 0), 0)
	}

	const takeCount = $derived(groups.reduce((n, g) => n + g.recordings.length, 0))
	const totalDurationS = $derived(
		groups.reduce((n, g) => n + g.recordings.reduce((m, r) => m + (r.duration_s ?? 0), 0), 0)
	)

	// Récapitulatif porté par l'en-tête : ce qu'a produit la session, d'un coup d'œil.
	const sessionStats = $derived(
		groups.length === 0
			? null
			: [
					`${groups.length} morceau${groups.length > 1 ? 'x' : ''}`,
					`${takeCount} prise${takeCount > 1 ? 's' : ''}`,
					totalDurationS > 0 ? formatDurationLong(totalDurationS) : null
				]
					.filter(Boolean)
					.join(' · ')
	)
	const sessionTracks = $derived(groups.flatMap(groupTracks))

	let sessionSaving = $state(false)
	let sessionError = $state<string | null>(null)
	let addingToAgenda = $state(false)
	let agendaError = $state<string | null>(null)

	async function saveSession(patch: {
		date: string
		type: SessionType
		title: string | null
		location: string | null
		location_coords: { lat: number; lon: number } | null
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

	// La ligne enregistre elle-même la qualité ; la page n'a qu'à refléter le résultat
	// dans sa copie locale, que `data` réécrasera à la prochaine invalidation.
	function applyQuality(id: number, status: string | null) {
		groups = groups.map((g) => ({
			...g,
			recordings: g.recordings.map((r) => (r.id === id ? { ...r, status } : r))
		}))
	}

	let editMode = $state(false)
	let deletingRecordingId = $state<number | null>(null)
	let deleting = $state(false)
	let deleteError = $state<string | null>(null)

	// Une seule confirmation pour les deux suppressions de la page.
	let pendingDelete = $state<
		| { kind: 'recording'; id: number; songTitle: string; take: number; shareCount: number }
		| { kind: 'session' }
		| null
	>(null)

	// Ce qui cesse de marcher hors du groupe se dit : qui a reçu le lien ne sera pas prévenu.
	function publicLinksNotice(count: number): string {
		if (count === 0) return ''
		return count > 1
			? ` Les ${count} liens d'écoute publics cesseront de fonctionner.`
			: " Le lien d'écoute public cessera de fonctionner."
	}

	const sessionShareCount = $derived(
		groups.reduce((n, g) => n + g.recordings.reduce((m, r) => m + r.share_count, 0), 0)
	)

	const deleteDialog = $derived.by(() => {
		if (pendingDelete?.kind === 'recording') {
			return {
				title: 'Supprimer cette prise ?',
				message: `La prise ${pendingDelete.take} de « ${pendingDelete.songTitle} » sera supprimée avec son fichier audio, ses commentaires et sa place dans les playlists.${publicLinksNotice(pendingDelete.shareCount)} Les autres prises du morceau gardent leur numéro. Cette action est irréversible.`,
				confirmLabel: 'Supprimer la prise'
			}
		}
		const photo = data.photo ? ', sa photo de bandeau' : ''
		return {
			title: 'Supprimer cette session ?',
			message: takeCount > 0
				? `La session sera supprimée avec ses ${takeCount} prise${takeCount > 1 ? 's' : ''}, leurs fichiers audio, leurs commentaires et leur place dans les playlists${photo}, ainsi que son événement d’agenda.${publicLinksNotice(sessionShareCount)} Les morceaux restent au référentiel. Cette action est irréversible.`
				: `La session sera supprimée${photo}, avec son événement d’agenda. Cette action est irréversible.`,
			confirmLabel: 'Supprimer la session'
		}
	})

	function confirmDelete() {
		const target = pendingDelete
		pendingDelete = null
		if (target?.kind === 'recording') deleteRecording(target.id)
		else if (target?.kind === 'session') deleteSession()
	}

	async function deleteRecording(id: number) {
		deletingRecordingId = id
		deleteError = null
		try {
			const res = await fetch(`/api/recordings/${id}`, { method: 'DELETE' })
			const json = await res.json()
			if (!res.ok) { deleteError = json.error ?? 'Erreur.'; return }
			groups = groups
				.map((g) => ({ ...g, recordings: g.recordings.filter((r) => r.id !== id) }))
				.filter((g) => g.recordings.length > 0)
		} catch {
			deleteError = 'Erreur réseau.'
		} finally {
			deletingRecordingId = null
		}
	}

	async function deleteSession() {
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

<main class="page page-wide">
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
		stats={sessionStats}
		photo={data.photo}
		place={data.place}
	>
		{#snippet actions()}
			<PlayAllButton tracks={sessionTracks} label="Écouter toute la session à la suite" />
		{/snippet}
	</SessionEditor>

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
				<!-- Chaque morceau s'ouvre comme un album : pochette, titre, ce qu'il contient,
				     et de quoi enchaîner ses prises dans le mini-lecteur. -->
				<header class="song-head">
					<SongCover songId={group.song.id} title={group.song.title} size={56} coverVersion={group.song.cover_version} />
					<div class="song-head-text">
						<span class="song-kicker">{songAlbumArtist(group.song, groupName)}</span>
						<h2><a href="/songs/{group.song.id}">{group.song.title}</a></h2>
						<span class="song-head-sub">
							{group.recordings.length} prise{group.recordings.length > 1 ? 's' : ''}
							{#if groupDurationS(group) > 0} · {formatDurationLong(groupDurationS(group))}{/if}
						</span>
					</div>
					<PlayAllButton
						tracks={groupTracks(group)}
						label="Écouter les prises de {group.song.title} à la suite"
					/>
				</header>

				<div class="recording-list">
					{#each group.recordings as r (r.id)}
						<RecordingRow
							recording={r}
							songId={group.song.id}
							songTitle={group.song.title}
							sessionDate={String(session.date)}
							{allowPublicShare}
							editableQuality
							{editMode}
							canDelete={canDeleteRecording(r)}
							deleting={deletingRecordingId === r.id}
							onQualityChange={(status) => applyQuality(r.id, status)}
							onDelete={() => (pendingDelete = { kind: 'recording', id: r.id, songTitle: group.song.title, take: r.take, shareCount: r.share_count })}
						/>
					{/each}
				</div>
			</section>
		{/each}
	{/if}

	<div class="footer-actions">
		<a href="/upload?session_id={session.id}" class="btn btn-primary"><Icon name="plus" /> Ajouter une prise</a>
		<button class="btn btn-secondary" onclick={() => { editMode = !editMode }}>
			{editMode ? 'Terminer' : 'Modifier les prises'}
		</button>
		{#if canDeleteSession}
		<button class="btn btn-danger" onclick={() => (pendingDelete = { kind: 'session' })} disabled={deleting}>
			{deleting ? 'Suppression…' : 'Supprimer la session'}
		</button>
		{/if}
	</div>
	{#if deleteError}
		<p class="message-error" style="margin-top: 0.5rem;">{deleteError}</p>
	{/if}

	<ConfirmDialog
		open={pendingDelete !== null}
		level="danger"
		title={deleteDialog.title}
		message={deleteDialog.message}
		confirmLabel={deleteDialog.confirmLabel}
		onConfirm={confirmDelete}
		onCancel={() => (pendingDelete = null)}
	/>
</main>

<style>
	/* Les prises ne sont plus un tableau à faire tenir : chaque ligne se replie seule.
	   La largeur est donc celle d'un texte confortable, pas celle de huit colonnes. */

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
		border-radius: var(--radius-pill);
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
		font-size: var(--text-2xs);
		color: var(--color-text-muted);
	}

	.song-section {
		margin-bottom: 2rem;
		scroll-margin-top: 1rem;
	}

	.song-head {
		display: flex;
		align-items: center;
		gap: 0.9rem;
		margin-bottom: 0.6rem;
	}

	.song-head-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.05rem;
	}

	.song-kicker {
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--color-text-muted);
	}

	h2 { font-size: var(--text-lg); line-height: 1.2; margin: 0; overflow-wrap: anywhere; }
	h2 a { color: var(--color-primary); text-decoration: none; }
	h2 a:hover { text-decoration: underline; }

	.song-head-sub {
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		font-variant-numeric: tabular-nums;
	}

	.footer-actions { margin-top: 2rem; display: flex; gap: 0.75rem; align-items: center; }

	/* Même signal visuel que l'action « Uploader » de la navigation. */

	/* Les prises se replient toutes seules (voir RecordingRow) : il ne reste ici que
	   ce qui entoure la liste. */
	@media (max-width: 640px) {

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
