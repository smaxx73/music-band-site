<script lang="ts">
	import type { PageData } from './$types'
	import { untrack } from 'svelte'
	import { formatDateOnly } from '$lib/date'
	import AudioPlayer from '$lib/components/AudioPlayer.svelte'
	import PlaylistQueue from '$lib/components/PlaylistQueue.svelte'
	import SongDetails from '$lib/components/SongDetails.svelte'
	import Modal from '$lib/components/Modal.svelte'
	import { player } from '$lib/player.svelte'

	let { data }: { data: PageData } = $props()

	type Item = {
		id: number; position: number; note: string | null
		recording_id: number; take: number; duration_s: number | null
		recording_status: string; file_path: string
		song_id: number; song_title: string; song_composer: string | null
		song_lyrics: string | null; song_music_notes: string | null
		session_id: number; session_date: string; session_location: string | null
	}
	type Playlist = { id: number; name: string; description: string | null }
	type AvailableRecording = {
		recording_id: number; take: number; duration_s: number | null
		recording_status: string; file_path: string
		song_id: number; song_title: string; song_composer: string | null
		song_lyrics: string | null; song_music_notes: string | null
		session_id: number; session_date: string; session_location: string | null
		in_playlist: boolean
	}

	const playlist = $derived(data.playlist as unknown as Playlist)
	let items = $state(untrack(() => data.items as unknown as Item[]))
	const peaks = $derived((data as unknown as { peaks: Record<number, number[]> }).peaks)
	const durations = $derived((data as unknown as { durations: Record<number, number | null> }).durations)
	let availableRecordings = $state(untrack(() => data.availableRecordings as unknown as AvailableRecording[]))

	type PlayerState = {
		currentTime: number
		duration: number
		isPlaying: boolean
		ready: boolean
	}

	let currentIdx = $state(0)
	let playerState = $state<PlayerState>({
		currentTime: 0,
		duration: 0,
		isPlaying: false,
		ready: false
	})
	let autoplayTrack = $state(false)
	let toggleToken = $state(0)
	let toggleRequest = $state<{ token: number } | null>(null)

	function formatDate(d: string | Date) {
		return formatDateOnly(d, {
			day: 'numeric', month: 'short', year: 'numeric'
		})
	}

	function audioUrl(item: Item) {
		return `/audio/${item.recording_id}.mp3`
	}

	function jumpTo(idx: number) {
		if (idx === currentIdx && playerState.ready) {
			toggleToken += 1
			toggleRequest = { token: toggleToken }
			return
		}
		currentIdx = idx
		autoplayTrack = true
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

		if (currentIdx === fromIdx) currentIdx = toIdx
		else if (fromIdx < currentIdx && toIdx >= currentIdx) currentIdx--
		else if (fromIdx > currentIdx && toIdx <= currentIdx) currentIdx++

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

	async function removeItem(itemId: number, idx: number) {
		await fetch(`/api/playlists/${playlist.id}/items/${itemId}`, { method: 'DELETE' })
		const newItems = items.filter((_, i) => i !== idx)
		if (currentIdx >= newItems.length) currentIdx = Math.max(0, newItems.length - 1)
		items = newItems
		if (newItems.length === 0) {
			playerState = { currentTime: 0, duration: 0, isPlaying: false, ready: false }
			autoplayTrack = false
		}
	}

	function playNext() {
		if (currentIdx >= items.length - 1) {
			autoplayTrack = false
			return
		}
		currentIdx += 1
		autoplayTrack = true
	}

	const currentTrack = $derived(items[currentIdx] ? {
		id: items[currentIdx].recording_id,
		src: audioUrl(items[currentIdx]),
		peaks: peaks[items[currentIdx].recording_id] ?? [],
		duration: (items[currentIdx].duration_s ?? durations[items[currentIdx].recording_id]) ?? undefined
	} : null)
</script>

<svelte:head>
	<title>{playlist.name}</title>
</svelte:head>

<main>
	<nav class="breadcrumb">
		<a href="/playlists">Playlists</a> / <span>{playlist.name}</span>
	</nav>

	<div class="playlist-header">
		<div>
			<h1>{playlist.name}</h1>
			{#if playlist.description}<p class="desc">{playlist.description}</p>{/if}
		</div>
		<button class="btn btn-primary btn-sm" onclick={openAddModal}>+ Ajouter des prises</button>
	</div>

	{#if items.length === 0}
		<div class="empty-state">
			<p class="empty">Cette playlist est vide.</p>
			<button class="btn btn-primary" onclick={openAddModal}>+ Ajouter des prises</button>
		</div>
	{:else}
		<!-- Lecteur -->
		<div class="player-card">
			{#if items[currentIdx]}
				<div class="now-playing">
					<span class="np-label">En cours</span>
					<strong>{items[currentIdx].song_title}</strong>
					— prise #{items[currentIdx].take}
					· {formatDate(items[currentIdx].session_date)}
					{#if items[currentIdx].note}<em>({items[currentIdx].note})</em>{/if}
				</div>
			{/if}

			{#if items[currentIdx]}
				<SongDetails
					lyrics={items[currentIdx].song_lyrics}
					musicNotes={items[currentIdx].song_music_notes}
					compact
				/>
			{/if}

			{#if currentTrack}
				<AudioPlayer
					track={currentTrack}
					height={70}
					autoplay={autoplayTrack}
					toggleRequest={toggleRequest}
					onStateChange={(state) => {
						playerState = state
						// Ce lecteur garde sa propre file : quand il démarre, il prend la
						// main sur la prise isolée éventuellement en cours dans la barre.
						if (state.isPlaying) player.pause()
					}}
					onEnded={playNext}
				/>
			{/if}
		</div>

		<PlaylistQueue
			items={items}
			currentIndex={currentIdx}
			error={saveError}
			onSelect={jumpTo}
			onReorder={reorderItems}
			onRemove={removeItem}
		/>
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
</main>

<style>
	main { max-width: 720px; margin: 2rem auto; padding: 0 1rem; }

	.playlist-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 0.3rem; }
	h1 { font-size: 1.4rem; margin: 0 0 0.3rem; }
	.desc { font-size: var(--text-sm); color: #666; margin: 0 0 1.5rem; }
	.empty-state { text-align: center; padding: 2rem 0; }
	.empty-state .empty { margin-top: 0; }

	.player-card {
		background: var(--color-bg-subtle);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-xl);
		padding: 1rem 1.25rem;
		margin-bottom: 1.5rem;
	}

	.now-playing {
		font-size: 0.82rem; color: var(--color-text-secondary); margin-bottom: 0.6rem;
		display: flex; align-items: baseline; gap: 0.4rem; flex-wrap: wrap;
	}
	.np-label {
		font-size: 0.7rem; font-weight: 700; text-transform: uppercase;
		background: var(--color-primary); color: white; padding: 0.1rem 0.4rem; border-radius: var(--radius-sm);
	}

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
		main { margin: 1rem auto; padding: 0 0.75rem; }

		h1 { font-size: 1.2rem; }

		.player-card { padding: 0.85rem 0.8rem; }
		.playlist-header { align-items: stretch; flex-direction: column; }
		.playlist-header .btn { align-self: flex-start; }
		.recording-options button { align-items: flex-start; flex-direction: column; gap: 0.2rem; }
	}
</style>
