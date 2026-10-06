<script lang="ts">
	import type { PageData } from './$types'
	import { untrack } from 'svelte'
	import { formatDateOnly } from '$lib/date'
	import PlaylistQueue from '$lib/components/PlaylistQueue.svelte'
	import SongDetails from '$lib/components/SongDetails.svelte'
	import Modal from '$lib/components/Modal.svelte'
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte'
	import { player, type PlayerTrack } from '$lib/player.svelte'
	import MediaHeader from '$lib/components/MediaHeader.svelte'
	import Icon from '$lib/components/Icon.svelte'
	import IconCover from '$lib/components/IconCover.svelte'
	import PlaylistTrackRow from '$lib/components/PlaylistTrackRow.svelte'
	import PlayAllButton from '$lib/components/PlayAllButton.svelte'
	import { canDeleteGroupContent, formatDurationLong } from '$lib/types'
	import { goto } from '$app/navigation'

	let { data }: { data: PageData } = $props()

	type Item = {
		id: number; position: number; note: string | null
		recording_id: number; take: number; duration_s: number | null
		recording_status: string | null; file_path: string
		song_id: number; song_title: string; song_composer: string | null
		song_lyrics: string | null; song_music_notes: string | null
		session_id: number; session_date: string; session_location: string | null
	}
	type Playlist = {
		id: number; name: string; description: string | null
		created_by: string; created_by_user_id: number | null
	}
	type AvailableRecording = {
		recording_id: number; take: number; duration_s: number | null
		recording_status: string | null; file_path: string
		song_id: number; song_title: string; song_composer: string | null
		song_lyrics: string | null; song_music_notes: string | null
		session_id: number; session_date: string; session_location: string | null
		in_playlist: boolean
	}

	const playlist = $derived(data.playlist as unknown as Playlist)
	const canDelete = $derived(
		canDeleteGroupContent(data.user, data.user?.current_group_id, playlist.created_by_user_id)
	)
	let items = $state(untrack(() => data.items as unknown as Item[]))
	let availableRecordings = $state(untrack(() => data.availableRecordings as unknown as AvailableRecording[]))

	// La vue par défaut se lit et s'écoute ; réordonner, retirer et ajouter des prises
	// se fait en mode édition, pour qu'un geste de lecture ne déplace rien par mégarde.
	let editMode = $state(false)

	// La lecture passe par le mini-lecteur, comme pour une session : il enchaîne la
	// playlist depuis la piste choisie, et survit à la navigation.
	const tracks = $derived<PlayerTrack[]>(items.map((item) => ({
		recordingId: item.recording_id,
		songId: item.song_id,
		songTitle: item.song_title,
		take: item.take,
		sessionDate: item.session_date,
		durationS: item.duration_s
	})))
	const currentIdx = $derived(items.findIndex((item) => item.recording_id === player.track?.recordingId))
	const currentItem = $derived(currentIdx >= 0 ? items[currentIdx] : null)

	function playFrom(idx: number) {
		if (idx === currentIdx) player.toggle()
		else player.playAll(tracks.slice(idx))
	}

	function formatDate(d: string | Date) {
		return formatDateOnly(d, {
			day: 'numeric', month: 'short', year: 'numeric'
		})
	}

	let saveError = $state<string | null>(null)
	let showAddModal = $state(false)
	let addQuery = $state('')
	let addingRecordingId = $state<number | null>(null)
	let addError = $state<string | null>(null)
	const selectableRecordings = $derived(availableRecordings.filter((recording) => {
		if (recording.in_playlist) return false
		const query = addQuery.trim().toLocaleLowerCase('fr-FR')
		return !query || `${recording.song_title} ${recording.session_date} ${recording.take}`
			.toLocaleLowerCase('fr-FR').includes(query)
	}))

	function openAddModal() {
		showAddModal = true
		addQuery = ''
		addError = null
	}

	async function addRecording(recording: AvailableRecording) {
		addingRecordingId = recording.recording_id
		addError = null
		try {
			const res = await fetch(`/api/playlists/${playlist.id}/items`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ recording_id: recording.recording_id })
			})
			const body = await res.json().catch(() => ({})) as { id?: number; position?: number; note?: string | null; code?: string; error?: string }
			if (body.code === 'already_added') {
				availableRecordings = availableRecordings.map((candidate) => candidate.recording_id === recording.recording_id
					? { ...candidate, in_playlist: true }
					: candidate)
				return
			}
			if (!res.ok || body.id === undefined || body.position === undefined) {
				addError = body.error ?? 'Impossible d’ajouter la prise.'
				return
			}
			items = [...items, {
				id: body.id,
				position: body.position,
				note: body.note ?? null,
				recording_id: recording.recording_id,
				take: recording.take,
				duration_s: recording.duration_s,
				recording_status: recording.recording_status,
				file_path: recording.file_path,
				song_id: recording.song_id,
				song_title: recording.song_title,
				song_composer: recording.song_composer,
				song_lyrics: recording.song_lyrics,
				song_music_notes: recording.song_music_notes,
				session_id: recording.session_id,
				session_date: recording.session_date,
				session_location: recording.session_location
			}]
			availableRecordings = availableRecordings.map((candidate) => candidate.recording_id === recording.recording_id
				? { ...candidate, in_playlist: true }
				: candidate)
		} catch {
			addError = 'Erreur réseau.'
		} finally {
			addingRecordingId = null
		}
	}

	async function reorderItems(fromIdx: number, toIdx: number) {
		const newItems = [...items]
		const [moved] = newItems.splice(fromIdx, 1)
		newItems.splice(toIdx, 0, moved)

		items = newItems
		await savePositions()
	}

	async function savePositions() {
		saveError = null
		const payload = items.map((item, i) => ({ id: item.id, position: i + 1 }))
		const res = await fetch(`/api/playlists/${playlist.id}/items`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		})
		if (!res.ok) {
			const data = await res.json().catch(() => ({}))
			saveError = (data as { error?: string }).error ?? `Erreur ${res.status}`
		}
	}

	// Retirer une prise se rattrape en la rajoutant, sauf la note qu'on lui avait mise
	// dans cette playlist : seule celle-là demande confirmation.
	let pendingRemove = $state<(typeof items)[number] | null>(null)

	function requestRemove(itemId: number) {
		const item = items.find((i) => i.id === itemId)
		if (!item) return
		if (item.note) pendingRemove = item
		else void removeItem(itemId)
	}

	async function removeItem(itemId: number) {
		pendingRemove = null
		saveError = null
		try {
			const res = await fetch(`/api/playlists/${playlist.id}/items/${itemId}`, { method: 'DELETE' })
			if (!res.ok) {
				const data = await res.json().catch(() => ({}))
				saveError = (data as { error?: string }).error ?? `Erreur ${res.status}`
				return
			}
		} catch {
			saveError = 'Erreur réseau : la prise n’a pas été retirée.'
			return
		}
		items = items.filter((i) => i.id !== itemId)
		if (items.length === 0) editMode = false
	}

	// ─── Suppression ───────────────────────────────────────────────────────
	let confirmDeleteOpen = $state(false)
	let deleting = $state(false)
	let deleteError = $state<string | null>(null)

	const deleteMessage = $derived.by(() => {
		const notes = items.filter((i) => i.note).length
		const kept = items.length > 0
			? ` Ses ${items.length} prise${items.length > 1 ? 's' : ''} restent dans leurs sessions ; seuls l'ordre${notes > 0 ? ` et ${notes > 1 ? `les ${notes} notes` : 'la note'} de playlist` : ''} sont perdus.`
			: ''
		return `La playlist « ${playlist.name} » sera définitivement supprimée.${kept}`
	})

	async function deletePlaylist() {
		deleting = true
		deleteError = null
		try {
			const res = await fetch(`/api/playlists/${playlist.id}`, { method: 'DELETE' })
			if (!res.ok) {
				const body = await res.json().catch(() => ({}))
				deleteError = (body as { error?: string }).error ?? `Erreur ${res.status}`
				return
			}
			await goto('/playlists')
		} catch {
			deleteError = 'Erreur réseau : la playlist n’a pas été supprimée.'
		} finally {
			deleting = false
			confirmDeleteOpen = false
		}
	}

	const playlistStats = $derived.by(() => {
		const totalS = items.reduce((n, i) => n + (i.duration_s ?? 0), 0)
		return [
			`${items.length} prise${items.length > 1 ? 's' : ''}`,
			totalS > 0 ? formatDurationLong(totalS) : null,
			`par ${playlist.created_by}`
		]
			.filter(Boolean)
			.join(' · ')
	})

</script>

<svelte:head>
	<title>{playlist.name}</title>
</svelte:head>

<main class="page page-wide">
	<nav class="breadcrumb">
		<a href="/playlists">Playlists</a> / <span>{playlist.name}</span>
	</nav>

	<MediaHeader title={playlist.name} stats={playlistStats}>
		{#snippet kicker()}Playlist{/snippet}
		{#snippet cover()}
			<IconCover icon="playlist" />
		{/snippet}
		{#if playlist.description}<p class="desc">{playlist.description}</p>{/if}
		{#snippet actions()}
			{#if items.length > 0}
				<!-- En édition, « Terminer » prend le ton principal : c'est l'état dont on sort. -->
				<button
					class="btn {editMode ? 'btn-primary' : 'btn-ghost mh-secondary'}"
					aria-pressed={editMode}
					onclick={() => (editMode = !editMode)}
				>
					<Icon name={editMode ? 'check' : 'pencil'} size="0.9rem" />
					<span class="mh-label">{editMode ? 'Terminer' : 'Modifier'}</span>
				</button>
				<PlayAllButton {tracks} label="Écouter la playlist" />
			{/if}
		{/snippet}
	</MediaHeader>

	{#if items.length === 0}
		<div class="empty-state">
			<p class="empty">Cette playlist est vide.</p>
			<button class="btn btn-primary" onclick={openAddModal}><Icon name="plus" /> Ajouter des prises</button>
		</div>
	{:else if editMode}
		<!-- Mode édition : glisser pour réordonner, × pour retirer. Toucher une piste la
		     lance quand même — on réécoute souvent pour décider de l'ordre. -->
		<div class="edit-bar">
			<p class="edit-hint">Glissez les prises pour changer l'ordre.</p>
			<button class="btn btn-primary btn-sm" onclick={openAddModal}><Icon name="plus" /> Ajouter des prises</button>
		</div>
		<PlaylistQueue
			{items}
			currentIndex={currentIdx}
			error={saveError}
			onSelect={playFrom}
			onReorder={reorderItems}
			onRemove={requestRemove}
		/>
	{:else}
		{#if currentItem && (currentItem.song_lyrics || currentItem.song_music_notes)}
			<!-- Paroles et notes du morceau qu'on écoute : c'est en répétant sur une
			     playlist qu'on en a besoin. -->
			<section class="now-playing" aria-label="Morceau en cours">
				<p class="np-title">
					<span class="np-label">En cours</span>
					<strong>{currentItem.song_title}</strong> — prise {currentItem.take}
				</p>
				<SongDetails
					lyrics={currentItem.song_lyrics}
					musicNotes={currentItem.song_music_notes}
					compact
				/>
			</section>
		{/if}

		<div class="tracklist">
			{#each items as item, i (item.id)}
				<PlaylistTrackRow
					{item}
					position={i + 1}
					current={i === currentIdx}
					playing={i === currentIdx && player.isPlaying}
					onToggle={() => playFrom(i)}
				/>
			{/each}
		</div>
	{/if}

	{#if showAddModal}
		<Modal title="Ajouter des prises" onClose={() => (showAddModal = false)}>
			<div class="add-modal-content">
				<p class="modal-hint">Seules les prises avec une piste audio peuvent être lues dans une playlist.</p>
				<input class="recording-search" bind:value={addQuery} placeholder="Rechercher un morceau ou une date…" />
				{#if addError}<p class="modal-error" role="alert">{addError}</p>{/if}
				{#if selectableRecordings.length === 0}
					<p class="modal-hint">{availableRecordings.some((recording) => !recording.in_playlist) ? 'Aucune prise ne correspond à cette recherche.' : 'Toutes les prises audio sont déjà dans cette playlist.'}</p>
				{:else}
					<ul class="recording-options">
						{#each selectableRecordings as recording (recording.recording_id)}
							<li>
								<button onclick={() => addRecording(recording)} disabled={addingRecordingId !== null}>
									<span><strong>{recording.song_title}</strong> · prise #{recording.take}</span>
									<span class="recording-option-meta">{formatDate(recording.session_date)}{#if addingRecordingId === recording.recording_id} · Ajout…{/if}</span>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</Modal>
	{/if}
	<!-- Comme pour une prise, la suppression ne se propose qu'en édition : un geste
	     d'écoute ne doit pas tomber dessus. Une playlist vide n'a pas de mode édition. -->
	{#if canDelete && (editMode || items.length === 0)}
		<div class="danger-row">
			<button class="btn btn-danger btn-sm" disabled={deleting} onclick={() => (confirmDeleteOpen = true)}>
				{deleting ? 'Suppression…' : 'Supprimer la playlist'}
			</button>
		</div>
		{#if deleteError}<p class="message-error">{deleteError}</p>{/if}
	{/if}

	<ConfirmDialog
		open={confirmDeleteOpen}
		level="danger"
		title="Supprimer cette playlist ?"
		message={deleteMessage}
		confirmLabel="Supprimer la playlist"
		busy={deleting}
		onConfirm={deletePlaylist}
		onCancel={() => (confirmDeleteOpen = false)}
	/>

	<ConfirmDialog
		open={pendingRemove !== null}
		level="warning"
		title="Retirer cette prise ?"
		message={pendingRemove
			? `« ${pendingRemove.song_title} », prise ${pendingRemove.take}, quitte la playlist avec sa note : « ${pendingRemove.note} ». La prise elle-même reste dans sa session.`
			: ''}
		confirmLabel="Retirer la prise"
		onConfirm={() => { if (pendingRemove) removeItem(pendingRemove.id) }}
		onCancel={() => (pendingRemove = null)}
	/>
</main>

<style>
	.desc { font-size: var(--text-sm); color: var(--color-text-secondary); margin: 0; }
	.empty-state { text-align: center; padding: 2rem 0; }
	.empty-state .empty { margin-top: 0; }

	.now-playing {
		background: var(--color-bg-subtle);
		border: 1px solid var(--color-border-light);
		border-radius: var(--radius-lg);
		padding: 0.75rem 1rem;
		margin-bottom: 1rem;
	}

	.np-title {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin: 0 0 0.4rem;
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
	}

	.np-label {
		font-size: var(--text-2xs); font-weight: 700; text-transform: uppercase;
		background: var(--color-accent); color: #fff; padding: 0.1rem 0.4rem; border-radius: var(--radius-sm);
	}

	.edit-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.5rem 1rem;
		margin-bottom: 0.75rem;
	}

	.danger-row { display: flex; justify-content: flex-end; margin-top: 1.5rem; }
	.edit-hint { margin: 0; font-size: var(--text-sm); color: var(--color-text-muted); }

	.add-modal-content { padding: 0.9rem 1.25rem 1.25rem; }
	.modal-hint, .modal-error { font-size: var(--text-sm); margin: 0 0 0.75rem; }
	.modal-hint { color: var(--color-text-muted); }
	.modal-error { color: var(--color-error); }
	.recording-search { box-sizing: border-box; width: 100%; margin-bottom: 0.5rem; }
	.recording-options { list-style: none; padding: 0; margin: 0; max-height: min(55vh, 25rem); overflow-y: auto; }
	.recording-options button { width: 100%; padding: 0.7rem 0.15rem; border: 0; border-top: 1px solid var(--color-border-light); background: transparent; color: inherit; text-align: left; font: inherit; cursor: pointer; display: flex; justify-content: space-between; gap: 1rem; }
	.recording-options button:hover:not(:disabled) { color: var(--color-accent); }
	.recording-options button:disabled { cursor: wait; opacity: var(--disabled-opacity); }
	.recording-option-meta { color: var(--color-text-muted); font-size: var(--text-xs); white-space: nowrap; }

	/* ─── Responsive ───────────────────── */
	@media (max-width: 640px) {

		.now-playing { padding: 0.65rem 0.75rem; }
		.recording-options button { align-items: flex-start; flex-direction: column; gap: 0.2rem; }
	}
</style>
