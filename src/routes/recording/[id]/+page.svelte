<script lang="ts">
	import type { PageData } from './$types'
	import { onMount, tick, untrack } from 'svelte'
	import { player } from '$lib/player.svelte'
	import { formatDateOnly } from '$lib/date'
	import AudioPlayer from '$lib/components/AudioPlayer.svelte'
	import CommentsPanel from '$lib/components/CommentsPanel.svelte'
	import SongDetails from '$lib/components/SongDetails.svelte'
	import Modal from '$lib/components/Modal.svelte'
	import YouTubePlayer from '$lib/components/YouTubePlayer.svelte'
	import { youtubeWatchUrl } from '$lib/youtube'
	import type { CommentWithReactions } from '$lib/types'

	let { data }: { data: PageData } = $props()

	type Recording = {
		id: number; take: number; status: string; notes: string | null
		duration_s: number | null; uploaded_by: string; session_id: number; song_id: number
		file_path: string | null; source_file_name: string | null
		youtube_video_id: string | null; youtube_title: string | null
		song_title: string; song_composer: string | null; song_key: string | null
		song_lyrics: string | null; song_music_notes: string | null
		session_date: string; session_location: string | null
	}
	type Comment = CommentWithReactions
	type MentionMember = { id: number; nickname: string; display_name: string }

	// $derived inscriptible : la note enregistrée s'affiche tout de suite, et `data`
	// reprend la main à la prochaine navigation.
	let recording = $derived(data.recording as unknown as Recording)
	// Une prise a une piste audio, une vidéo YouTube, ou les deux.
	const hasAudio = $derived(!!recording.file_path)
	// Avec les deux, l'audio s'affiche d'abord : c'est lui que jouent la barre du bas et les
	// playlists. $derived inscriptible : l'onglet revient à l'audio en changeant de prise.
	let view = $derived<'audio' | 'video'>(recording.file_path ? 'audio' : 'video')
	const showVideo = $derived(!!recording.youtube_video_id && view === 'video')
	let comments = $derived(data.comments as unknown as Comment[])
	const groupMembers = $derived(data.groupMembers as unknown as MentionMember[])

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

	function formatDate(d: string | Date) {
		return formatDateOnly(d, {
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

	type SiblingRecording = { id: number; take: number } | null
	const prevRecording = $derived(data.prevRecording as SiblingRecording)
	const nextRecording = $derived(data.nextRecording as SiblingRecording)

	const playerTrack = $derived({
		id: recording.id,
		src: `/audio/${recording.id}.mp3`,
		peaks: data.peaks as number[],
		duration: (recording.duration_s ?? (data as { peaksDuration?: number | null }).peaksDuration) ?? undefined
	})

	// La page devient la vue détaillée du lecteur partagé : arriver ici sur la prise
	// déjà en cours ne coupe pas la lecture, `load` ne retouche pas le `src`.
	// Une prise sans piste audio a son propre lecteur et laisse le lecteur partagé tranquille.
	$effect(() => {
		const r = recording
		if (!r.file_path) return
		untrack(() =>
			player.load({
				recordingId: r.id,
				songId: r.song_id,
				songTitle: r.song_title,
				take: r.take,
				sessionDate: String(r.session_date),
				durationS: r.duration_s
			})
		)
	})

	// Dès que la prise a sa piste audio, la page la pilote seule, onglet Vidéo compris : la
	// barre du bas y rejouerait la même prise en double, et les commentaires suivent le
	// lecteur affiché, pas la barre.
	$effect(() => {
		if (!hasAudio) return
		player.attachView()
		return () => player.detachView()
	})

	// Un seul lecteur actif à l'écran. Revenir à l'audio n'a rien à arrêter : le lecteur
	// vidéo est retiré de la page, et détruit avec lui.
	function selectView(next: 'audio' | 'video') {
		if (next === 'video') player.pause()
		view = next
	}

	// Note de la prise : les vues session et morceau l'affichent, mais renvoient ici
	// pour l'écrire — on écrit sur une prise là où on l'écoute, comme un commentaire.
	// `#notes` ouvre directement la saisie.
	let notesDraft = $state<string | null>(null)
	let notesSaving = $state(false)
	let notesError = $state<string | null>(null)
	let notesField = $state<HTMLTextAreaElement | null>(null)
	let notesBlock = $state<HTMLElement | null>(null)

	async function startEditNotes() {
		notesDraft = recording.notes ?? ''
		notesError = null
		await tick()
		notesField?.focus()
	}

	function cancelEditNotes() {
		notesDraft = null
		notesError = null
	}

	async function saveNotes() {
		const value = (notesDraft ?? '').trim()
		notesSaving = true
		notesError = null
		try {
			const res = await fetch(`/api/recordings/${recording.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ notes: value || null })
			})
			const json = await res.json()
			if (!res.ok) { notesError = json.error ?? 'Erreur.'; return }
			recording = { ...recording, notes: json.notes }
			notesDraft = null
		} catch {
			notesError = 'Erreur réseau.'
		} finally {
			notesSaving = false
		}
	}

	onMount(() => {
		if (location.hash !== '#notes') return
		notesBlock?.scrollIntoView({ block: 'center' })
		startEditNotes()
	})

	// Le lecteur reste à l'écran pendant qu'on lit les commentaires : la waveform et ses
	// marqueurs sont l'index de la discussion, ils n'ont pas à disparaître au premier
	// défilement. Il ne se colle que s'il laisse de quoi lire — une vidéo 16/9 sur un
	// téléphone occuperait la moitié de l'écran.
	let innerHeight = $state(0)
	let playerHeight = $state(0)
	const stickyPlayer = $derived(
		playerHeight > 0 && innerHeight > 0 && playerHeight <= innerHeight * 0.45
	)

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

<svelte:window bind:innerHeight />

<main style="--comment-scroll-margin: {stickyPlayer ? playerHeight + 24 : 16}px">
	<!-- Fil d'Ariane -->
	<nav class="breadcrumb">
		<a href="/sessions">Sessions</a> /
		<a href="/sessions/{recording.session_id}">{formatDate(recording.session_date)}</a> /
		<a href="/songs/{recording.song_id}">{recording.song_title}</a> /
		<span>Prise {recording.take}</span>
	</nav>

	<!-- En-tête -->
	<div class="header">
		<div>
			<h1>
				<a href="/songs/{recording.song_id}" class="song-link">{recording.song_title}</a>
				{#if recording.song_key}<span class="key">{recording.song_key}</span>{/if}
			</h1>
			<div class="meta">
				Prise {recording.take} · {formatDate(recording.session_date)}
				{#if recording.session_location} · {recording.session_location}{/if}
				· {recording.uploaded_by}
			</div>
			{#if hasAudio}
				<!-- `file_path` ("{id}.mp3") ne sert de repli que pour les prises d'avant la
				     migration 023, déposées quand le nom d'origine n'était pas conservé. -->
				<div class="meta file-meta" class:fallback={!recording.source_file_name}>
					🎵 {recording.source_file_name ?? recording.file_path}
				</div>
			{/if}
			{#if recording.youtube_video_id}
				<div class="meta file-meta">
					🎬 <a href={youtubeWatchUrl(recording.youtube_video_id)} target="_blank" rel="noopener noreferrer">
						{recording.youtube_title ?? 'Vidéo YouTube'}
					</a>
				</div>
			{/if}

			<!-- Note de la prise : c'est ici qu'elle s'écrit, les listes ne font que la lire. -->
			<div class="take-notes" id="notes" bind:this={notesBlock}>
				{#if notesDraft !== null}
					<textarea
						class="notes-field"
						rows="2"
						placeholder="Note sur cette prise…"
						bind:value={notesDraft}
						bind:this={notesField}
						disabled={notesSaving}
						onkeydown={(e) => {
							if (e.key === 'Escape') cancelEditNotes()
							else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveNotes()
						}}
					></textarea>
					<div class="notes-actions">
						<button class="btn btn-primary btn-sm" onclick={saveNotes} disabled={notesSaving}>
							{notesSaving ? 'Enregistrement…' : 'Enregistrer'}
						</button>
						<button class="btn btn-ghost btn-sm" onclick={cancelEditNotes} disabled={notesSaving}>Annuler</button>
						<span class="notes-hint">Ctrl/⌘+Entrée pour enregistrer</span>
					</div>
				{:else if recording.notes}
					<button class="notes-display" onclick={startEditNotes} title="Cliquer pour modifier">
						📝 {recording.notes}
					</button>
				{:else}
					<button class="notes-add" onclick={startEditNotes}>+ 📝 Ajouter une note</button>
				{/if}
				{#if notesError}<p class="notes-error">{notesError}</p>{/if}
			</div>
		</div>
		<div class="header-actions">
			<a
				href="/sessions/{recording.session_id}"
				class="btn btn-ghost btn-sm back-to-session"
				title="Retourner à la session"
			>← Retour à la session</a>
			{#if prevRecording}
				<a href="/recording/{prevRecording.id}" class="btn btn-secondary btn-sm" title="Prise précédente">← Prise {prevRecording.take}</a>
			{/if}
			{#if nextRecording}
				<a href="/recording/{nextRecording.id}" class="btn btn-secondary btn-sm" title="Prise suivante">Prise {nextRecording.take} →</a>
			{/if}
			{#if hasAudio}
				<button class="btn btn-secondary" onclick={openPlaylistModal}>+ Playlist</button>
			{/if}
		</div>
	</div>

	<SongDetails lyrics={recording.song_lyrics} musicNotes={recording.song_music_notes} compact />

	<!-- Modale playlist -->
	{#if showPlaylistModal}
		<Modal title="Ajouter à une playlist" size="sm" onClose={() => (showPlaylistModal = false)}>
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
		</Modal>
	{/if}

	<!-- Lecteur -->
	<div class="player-card" class:sticky={stickyPlayer} bind:clientHeight={playerHeight}>
		{#if hasAudio && recording.youtube_video_id}
			<div class="view-tabs" role="tablist" aria-label="Lecteur">
				<button role="tab" class="view-tab" class:active={view === 'audio'} aria-selected={view === 'audio'} onclick={() => selectView('audio')}>🎵 Audio</button>
				<button role="tab" class="view-tab" class:active={view === 'video'} aria-selected={view === 'video'} onclick={() => selectView('video')}>🎬 Vidéo</button>
			</div>
		{/if}
		{#if showVideo && recording.youtube_video_id}
			<YouTubePlayer
				videoId={recording.youtube_video_id}
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
		{:else}
			<AudioPlayer
				track={playerTrack}
				media={player.media}
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
		{/if}
	</div>

	<CommentsPanel
		recordingId={recording.id}
		comments={comments}
		members={groupMembers}
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
	}

	.header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 1.25rem; }
	.header-actions { display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0; flex-wrap: wrap; justify-content: flex-end; }

	/* Contenu de la modale playlist (structure commune dans app.css) */
	.modal-list { list-style: none; padding: 0.5rem 0; margin: 0; max-height: 320px; overflow-y: auto; }
	.modal-item {
		width: 100%; background: none; border: none; padding: 0.7rem 1.25rem;
		display: flex; align-items: center; gap: 0.75rem; cursor: pointer; text-align: left;
		transition: background 0.1s;
	}
	.modal-item:hover:not(:disabled) { background: var(--color-bg-subtle); }
	.modal-item:disabled { cursor: default; }
	.modal-item.added { background: #f0fdf4; }
	.modal-name { flex: 1; font-size: var(--text-sm); font-weight: 600; }
	.modal-count { font-size: var(--text-xs); color: #aaa; }
	.modal-check { font-size: var(--text-xs); color: var(--color-repertoire-text); font-weight: 700; }

	.modal-hint { padding: 1rem 1.25rem; font-size: var(--text-sm); color: var(--color-text-muted); margin: 0; }
	.modal-error { padding: 0.75rem 1.25rem; font-size: var(--text-sm); color: var(--color-error); margin: 0; }

	h1 {
		font-size: 1.4rem;
		margin: 0 0 0.3rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.song-link {
		color: inherit;
		text-decoration: none;
	}
	.song-link:hover { text-decoration: underline; }

	.key {
		font-size: 0.85rem;
		font-weight: 400;
		background: var(--color-abandoned-bg);
		color: var(--color-text-secondary);
		padding: 0.15rem 0.45rem;
		border-radius: var(--radius-sm);
	}

	.meta { font-size: 0.85rem; color: #666; }

	.file-meta { margin-top: 0.15rem; font-size: var(--text-xs); overflow-wrap: anywhere; }
	.file-meta.fallback { color: var(--color-text-muted); font-style: italic; }
	.file-meta a { color: inherit; }

	/* Note de la prise : discrète tant qu'il n'y en a pas, lisible dès qu'il y en a une. */
	.take-notes { margin-top: 0.5rem; }

	.notes-display,
	.notes-add {
		display: block;
		max-width: 100%;
		background: none;
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		padding: 0.25rem 0.4rem;
		margin-left: -0.4rem;
		font-family: inherit;
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		text-align: left;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		cursor: pointer;
	}

	.notes-display:hover,
	.notes-add:hover { border-color: var(--color-border-light); background: var(--color-bg-subtle); }

	.notes-add { color: var(--color-text-muted); border-style: dashed; border-color: var(--color-border-light); }

	.notes-field {
		width: 100%;
		max-width: 34rem;
		font-family: inherit;
		font-size: var(--text-sm);
		padding: 0.4rem 0.5rem;
		border: 1px solid var(--color-border-input);
		border-radius: var(--radius-md);
		resize: vertical;
	}

	.notes-actions {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-top: 0.3rem;
	}

	.notes-hint { font-size: var(--text-xs); color: var(--color-text-muted); }
	.notes-error { margin: 0.3rem 0 0; font-size: var(--text-xs); color: var(--color-error); }

	/* Prise audio + vidéo : un seul lecteur à l'écran à la fois */
	.view-tabs { display: flex; gap: 0.35rem; margin-bottom: 0.8rem; }

	.view-tab {
		background: none;
		border: 1px solid var(--color-border-light);
		border-radius: 999px;
		padding: 0.25rem 0.8rem;
		font: inherit;
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		cursor: pointer;
	}

	.view-tab.active {
		border-color: var(--color-accent);
		background: var(--color-accent-light);
		color: var(--color-accent);
		font-weight: 600;
	}

	/* Lecteur */
	.player-card {
		background: var(--color-bg-subtle);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-xl);
		padding: 1rem 1.25rem;
		margin-bottom: 2rem;
	}

	/* Collé en haut de la colonne qui défile (`.app-content` sur ordinateur, la page
	   elle-même sous la barre du haut sur mobile). */
	.player-card.sticky {
		position: sticky;
		top: 0;
		z-index: 5;
	}

	/* ─── Responsive ───────────────────── */
	@media (max-width: 640px) {
		main { margin: 1rem auto; padding: 0 0.75rem; }

		.header {
			flex-direction: column;
			align-items: stretch;
			gap: 0.75rem;
		}

		.header-actions { justify-content: flex-start; }
		.header-actions > * { flex: 1 1 auto; }

		h1 { font-size: 1.2rem; flex-wrap: wrap; }

		.player-card { padding: 0.85rem 0.8rem; }

		/* La barre du haut y est elle-même collée : on se pose dessous, pas dessus. */
		.player-card.sticky { top: 44px; }
	}
</style>
