<script lang="ts">
	import type { PageData } from './$types'
	import { untrack } from 'svelte'
	import AudioPlayer from '$lib/components/AudioPlayer.svelte'
	import CommentsPanel from '$lib/components/CommentsPanel.svelte'

	let { data }: { data: PageData } = $props()

	type Recording = {
		id: number; take: number; status: string; notes: string | null
		duration_s: number | null; uploaded_by: string; session_id: number; song_id: number
		song_title: string; song_composer: string | null; song_key: string | null
		session_date: string; session_location: string | null
	}
	type Comment = {
		id: number; recording_id: number; author: string
		content: string; timestamp_s: number | null; created_at: string
	}

	const recording = $derived(data.recording as unknown as Recording)
	let comments = $state(untrack(() => data.comments as unknown as Comment[]))
	const user = $derived((data as { user: string }).user)

	type PlayerState = {
		currentTime: number
		duration: number
		isPlaying: boolean
		ready: boolean
	}

	let playerState = $state<PlayerState>({
		currentTime: 0,
		duration: 0,
		isPlaying: false,
		ready: false
	})
	let seekToken = $state(0)
	let seekRequest = $state<{ seconds: number; token: number } | null>(null)
	let highlightToken = $state(0)
	let highlightRequest = $state<{ id: number; token: number } | null>(null)

	function formatTime(s: number) {
		if (!isFinite(s)) return '0:00'
		const m = Math.floor(s / 60)
		const sec = Math.floor(s % 60)
		return `${m}:${String(sec).padStart(2, '0')}`
	}

	function formatDate(d: string) {
		return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', {
			day: 'numeric', month: 'long', year: 'numeric'
		})
	}

	function seekTo(seconds: number) {
		seekToken += 1
		seekRequest = { seconds, token: seekToken }
	}

	// --- Modale "Ajouter à une playlist" ---
	type PlaylistRow = { id: number; name: string; item_count: number }

	let showPlaylistModal = $state(false)
	let modalPlaylists = $state<PlaylistRow[]>([])
	let modalLoading = $state(false)
	let modalError = $state<string | null>(null)
	let addedToId = $state<number | null>(null)

	async function openPlaylistModal() {
		showPlaylistModal = true
		modalError = null
		addedToId = null
		modalLoading = true
		try {
			const res = await fetch('/api/playlists')
			modalPlaylists = await res.json()
		} catch {
			modalError = 'Impossible de charger les playlists.'
		} finally {
			modalLoading = false
		}
	}

	async function addToPlaylist(playlistId: number) {
		modalError = null
		addedToId = playlistId
		try {
			const res = await fetch(`/api/playlists/${playlistId}/items`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ recording_id: recording.id })
			})
			if (!res.ok) {
				const data = await res.json()
				modalError = data.error ?? 'Erreur.'
				addedToId = null
			}
		} catch {
			modalError = 'Erreur réseau.'
			addedToId = null
		}
	}

	const playerTrack = $derived({
		id: recording.id,
		src: `/audio/${recording.id}.mp3`,
		peaks: data.peaks as number[],
		duration: (recording.duration_s ?? (data as { peaksDuration?: number | null }).peaksDuration) ?? undefined
	})

	const commentMarkers = $derived(
		comments
			.filter((comment) => comment.timestamp_s !== null && comment.timestamp_s !== undefined)
			.map((comment) => ({
				id: comment.id,
				time: comment.timestamp_s as number,
				label: `${formatTime(comment.timestamp_s as number)} — ${comment.author}`
			}))
	)
</script>

<svelte:head>
	<title>{recording.song_title} — Prise {recording.take}</title>
</svelte:head>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') showPlaylistModal = false }} />

<main>
	<!-- Fil d'Ariane -->
	<nav class="breadcrumb">
		<a href="/sessions">Sessions</a> /
		<a href="/sessions/{recording.session_id}">{formatDate(recording.session_date)}</a> /
		<span>{recording.song_title} — Prise {recording.take}</span>
	</nav>

	<!-- En-tête -->
	<div class="header">
		<div>
			<h1>
				{recording.song_title}
				{#if recording.song_key}<span class="key">{recording.song_key}</span>{/if}
			</h1>
			<div class="meta">
				Prise {recording.take} · {formatDate(recording.session_date)}
				{#if recording.session_location} · {recording.session_location}{/if}
				· {recording.uploaded_by}
			</div>
		</div>
		<button class="btn-playlist" onclick={openPlaylistModal}>+ Playlist</button>
	</div>

	<!-- Modale playlist -->
	{#if showPlaylistModal}
		<div class="modal-backdrop">
			<div class="modal" role="dialog" aria-modal="true" aria-label="Ajouter à une playlist">
				<div class="modal-header">
					<h3>Ajouter à une playlist</h3>
					<button class="modal-close" onclick={() => (showPlaylistModal = false)}>✕</button>
				</div>

				{#if modalLoading}
					<p class="modal-hint">Chargement…</p>
				{:else if modalError}
					<p class="modal-error">{modalError}</p>
				{:else if modalPlaylists.length === 0}
					<p class="modal-hint">Aucune playlist. <a href="/playlists">En créer une →</a></p>
				{:else}
					<ul class="modal-list">
						{#each modalPlaylists as p}
							<li>
								<button
									class="modal-item"
									class:added={addedToId === p.id}
									onclick={() => addToPlaylist(p.id)}
									disabled={addedToId !== null}
								>
									<span class="modal-name">{p.name}</span>
									<span class="modal-count">{p.item_count} prise{p.item_count > 1 ? 's' : ''}</span>
									{#if addedToId === p.id}<span class="modal-check">✓ Ajouté</span>{/if}
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Lecteur -->
	<div class="player-card">
		<AudioPlayer
			track={playerTrack}
			markers={commentMarkers}
			seekRequest={seekRequest}
			onStateChange={(state) => {
				playerState = state
			}}
			onMarkerSelect={(markerId) => {
				highlightToken += 1
				highlightRequest = { id: Number(markerId), token: highlightToken }
			}}
		/>
	</div>

	<CommentsPanel
		recordingId={recording.id}
		comments={comments}
		defaultAuthor={user ?? ''}
		currentTime={playerState.currentTime}
		playerReady={playerState.ready}
		isPlaying={playerState.isPlaying}
		highlightRequest={highlightRequest}
		onSeek={seekTo}
		onCommentsChange={(updatedComments) => {
			comments = updatedComments
		}}
	/>
</main>

<style>
	main {
		max-width: 720px;
		margin: 2rem auto;
		padding: 0 1rem;
		font-family: sans-serif;
	}

	.header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 1.25rem; }

	.btn-playlist {
		flex-shrink: 0; padding: 0.4rem 0.8rem; background: white;
		border: 1px solid #ccc; border-radius: 4px; font-size: 0.8rem;
		cursor: pointer; white-space: nowrap;
	}
	.btn-playlist:hover { background: #f8f8f8; border-color: #999; }

	/* Modale */
	.modal-backdrop {
		position: fixed; inset: 0; background: rgba(0,0,0,0.45);
		display: flex; align-items: center; justify-content: center;
		z-index: 100;
	}
	.modal {
		background: white; border-radius: 8px; width: 360px; max-width: 95vw;
		box-shadow: 0 8px 30px rgba(0,0,0,0.15); overflow: hidden;
	}
	.modal-header {
		display: flex; align-items: center; justify-content: space-between;
		padding: 1rem 1.25rem 0.75rem; border-bottom: 1px solid #f0f0f0;
	}
	.modal-header h3 { margin: 0; font-size: 0.95rem; }
	.modal-close { background: none; border: none; font-size: 1rem; cursor: pointer; color: #888; padding: 0; }
	.modal-close:hover { color: #333; }

	.modal-list { list-style: none; padding: 0.5rem 0; margin: 0; max-height: 320px; overflow-y: auto; }
	.modal-item {
		width: 100%; background: none; border: none; padding: 0.7rem 1.25rem;
		display: flex; align-items: center; gap: 0.75rem; cursor: pointer; text-align: left;
		transition: background 0.1s;
	}
	.modal-item:hover:not(:disabled) { background: #f8f8f8; }
	.modal-item:disabled { cursor: default; }
	.modal-item.added { background: #f0fdf4; }
	.modal-name { flex: 1; font-size: 0.875rem; font-weight: 600; }
	.modal-count { font-size: 0.75rem; color: #aaa; }
	.modal-check { font-size: 0.75rem; color: #16a34a; font-weight: 700; }

	.modal-hint { padding: 1rem 1.25rem; font-size: 0.875rem; color: #888; margin: 0; }
	.modal-error { padding: 0.75rem 1.25rem; font-size: 0.875rem; color: #c0392b; margin: 0; }

	.breadcrumb {
		font-size: 0.82rem;
		color: #888;
		margin-bottom: 1.25rem;
	}

	.breadcrumb a { color: inherit; text-decoration: none; }
	.breadcrumb a:hover { text-decoration: underline; }

	h1 {
		font-size: 1.4rem;
		margin: 0 0 0.3rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.key {
		font-size: 0.85rem;
		font-weight: 400;
		background: #f3f4f6;
		color: #555;
		padding: 0.15rem 0.45rem;
		border-radius: 3px;
	}

	.meta { font-size: 0.85rem; color: #666; }

	/* Lecteur */
	.player-card {
		background: #fafafa;
		border: 1px solid #e0e0e0;
		border-radius: 8px;
		padding: 1rem 1.25rem;
		margin-bottom: 2rem;
	}
</style>
