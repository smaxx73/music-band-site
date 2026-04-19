<script lang="ts">
	import type { PageData } from './$types'
	import { onMount, onDestroy, untrack } from 'svelte'

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

	// Lecteur
	let waveformEl: HTMLElement
	let wavesurfer: import('wavesurfer.js').default | null = null
	let isPlaying = $state(false)
	let currentTime = $state(0)
	let duration = $state(0)
	let volume = $state(1)
	let wsReady = $state(false)

	// Commentaires
	let author = $state(untrack(() => user ?? ''))
	let content = $state('')
	let anchorTimestamp = $state(false)
	let submitting = $state(false)
	let formError = $state<string | null>(null)

	// Ref vers les éléments de commentaire pour le scroll
	let commentEls = $state<Record<number, HTMLElement>>({})

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

	/** Crée un marqueur DOM au-dessus de la waveform */
	function addMarker(ws: import('wavesurfer.js').default, comment: Comment) {
		if (comment.timestamp_s === null || comment.timestamp_s === undefined) return
		if (!duration) return

		const pct = comment.timestamp_s / duration
		const marker = document.createElement('div')
		marker.className = 'ws-marker'
		marker.style.left = `${pct * 100}%`
		marker.title = `${formatTime(comment.timestamp_s)} — ${comment.author}`
		marker.dataset.commentId = String(comment.id)

		marker.addEventListener('click', (e) => {
			e.stopPropagation()
			ws.seekTo(pct)
			// Scroll vers le commentaire
			const el = commentEls[comment.id]
			if (el) {
				el.scrollIntoView({ behavior: 'smooth', block: 'center' })
				el.classList.add('highlight')
				setTimeout(() => el.classList.remove('highlight'), 1500)
			}
		})

		waveformEl.style.position = 'relative'
		waveformEl.appendChild(marker)
	}

	function clearMarkers() {
		waveformEl?.querySelectorAll('.ws-marker').forEach((m) => m.remove())
	}

	function rebuildMarkers(ws: import('wavesurfer.js').default) {
		clearMarkers()
		for (const c of comments) addMarker(ws, c)
	}

	onMount(async () => {
		// Import dynamique — WaveSurfer accède à window
		const WaveSurfer = (await import('wavesurfer.js')).default

		wavesurfer = WaveSurfer.create({
			container: waveformEl,
			waveColor: '#c0c0c0',
			progressColor: '#1a1a1a',
			cursorColor: '#1a1a1a',
			barWidth: 2,
			barGap: 1,
			barRadius: 2,
			height: 80,
			url: `/audio/${recording.id}.mp3`
		})

		const ws = wavesurfer

		ws.on('ready', (dur) => {
			duration = dur
			wsReady = true
			rebuildMarkers(ws)
		})

		ws.on('timeupdate', (t) => {
			currentTime = t
		})

		ws.on('play', () => { isPlaying = true })
		ws.on('pause', () => { isPlaying = false })
		ws.on('finish', () => { isPlaying = false })
	})

	onDestroy(() => {
		wavesurfer?.destroy()
	})

	function togglePlay() {
		wavesurfer?.playPause()
	}

	function seekStart() {
		wavesurfer?.seekTo(0)
	}

	function skipForward() {
		if (!wavesurfer || !duration) return
		const next = Math.min(currentTime + 10, duration)
		wavesurfer.seekTo(next / duration)
	}

	function setVolume(e: Event) {
		volume = parseFloat((e.target as HTMLInputElement).value)
		wavesurfer?.setVolume(volume)
	}

	async function submitComment(e: SubmitEvent) {
		e.preventDefault()
		formError = null

		if (!author.trim()) { formError = 'Saisis ton prénom.'; return }
		if (!content.trim()) { formError = 'Le commentaire est vide.'; return }

		// Capturer le timestamp au moment du clic Envoyer
		const ts = anchorTimestamp && isFinite(currentTime) && currentTime > 0
			? currentTime
			: null

		submitting = true
		try {
			const res = await fetch('/api/comments', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					recording_id: recording.id,
					author: author.trim(),
					content: content.trim(),
					timestamp_s: ts
				})
			})
			const json = await res.json()
			if (!res.ok) { formError = json.error ?? 'Erreur.'; return }

			comments = [...comments, json as Comment]
			content = ''
			anchorTimestamp = false

			// Reconstruire les marqueurs avec le nouveau commentaire
			if (wavesurfer && wsReady) rebuildMarkers(wavesurfer)

			// Scroll vers le nouveau commentaire
			await new Promise((r) => setTimeout(r, 50))
			commentEls[json.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
		} catch {
			formError = 'Erreur réseau.'
		} finally {
			submitting = false
		}
	}

	// Cocher "ancrer" par défaut quand le lecteur est en pause (et prêt)
	$effect(() => {
		if (wsReady && !isPlaying && currentTime > 0) {
			anchorTimestamp = true
		} else if (isPlaying) {
			anchorTimestamp = false
		}
	})

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
</script>

<svelte:head>
	<title>{recording.song_title} — prise #{recording.take}</title>
</svelte:head>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') showPlaylistModal = false }} />

<main>
	<!-- Fil d'Ariane -->
	<nav class="breadcrumb">
		<a href="/sessions">Sessions</a> /
		<a href="/sessions/{recording.session_id}">{formatDate(recording.session_date)}</a> /
		<span>{recording.song_title} — prise #{recording.take}</span>
	</nav>

	<!-- En-tête -->
	<div class="header">
		<div>
			<h1>
				{recording.song_title}
				{#if recording.song_key}<span class="key">{recording.song_key}</span>{/if}
			</h1>
			<div class="meta">
				Prise #{recording.take} · {formatDate(recording.session_date)}
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
		<!-- Waveform -->
		<div class="waveform-wrap">
			<div bind:this={waveformEl} class="waveform"></div>
			{#if !wsReady}
				<div class="waveform-loading">Chargement…</div>
			{/if}
		</div>

		<!-- Contrôles -->
		<div class="controls">
			<div class="controls-left">
				<button class="ctrl-btn" onclick={seekStart} title="Retour au début">⏮</button>
				<button class="ctrl-btn play-btn" onclick={togglePlay} disabled={!wsReady}>
					{isPlaying ? '⏸' : '▶'}
				</button>
				<button class="ctrl-btn" onclick={skipForward} title="+10s" disabled={!wsReady}>⏭</button>
			</div>

			<div class="time">
				<span class="current">{formatTime(currentTime)}</span>
				<span class="sep">/</span>
				<span class="total">{formatTime(duration)}</span>
			</div>

			<div class="controls-right">
				<label class="volume-label">
					🔊
					<input
						type="range" min="0" max="1" step="0.05"
						value={volume}
						oninput={setVolume}
						class="volume-slider"
					/>
				</label>
			</div>
		</div>
	</div>

	<!-- Commentaires -->
	<section class="comments-section">
		<h2>Commentaires ({comments.length})</h2>

		{#if comments.length === 0}
			<p class="empty">Pas encore de commentaire.</p>
		{:else}
			<ul class="comment-list">
				{#each comments as c (c.id)}
					<li
						class="comment"
						bind:this={commentEls[c.id]}
					>
						<div class="comment-header">
							<strong>{c.author}</strong>
							{#if c.timestamp_s !== null && c.timestamp_s !== undefined}
								<button
									class="timestamp-link"
									onclick={() => {
										if (!wavesurfer || !duration) return
										wavesurfer.seekTo(c.timestamp_s! / duration)
									}}
								>
									⏱ {formatTime(c.timestamp_s)}
								</button>
							{:else}
								<span class="global-badge">global</span>
							{/if}
							<span class="comment-date">
								{new Date(c.created_at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
							</span>
						</div>
						<p class="comment-content">{c.content}</p>
					</li>
				{/each}
			</ul>
		{/if}

		<!-- Formulaire d'ajout -->
		<form class="comment-form" onsubmit={submitComment}>
			<h3>Ajouter un commentaire</h3>

			{#if formError}
				<p class="error">{formError}</p>
			{/if}

			<label>
				Prénom
				<input type="text" bind:value={author} required disabled={submitting} />
			</label>

			<label>
				Commentaire
				<textarea rows="3" bind:value={content} required disabled={submitting}></textarea>
			</label>

			<label class="checkbox-label">
				<input type="checkbox" bind:checked={anchorTimestamp} disabled={submitting} />
				Ancrer au timestamp {anchorTimestamp && currentTime > 0 ? `(${formatTime(currentTime)})` : ''}
			</label>

			<button type="submit" class="btn-primary" disabled={submitting}>
				{submitting ? 'Envoi…' : 'Envoyer'}
			</button>
		</form>
	</section>
</main>

<style>
	:global(.ws-marker) {
		position: absolute;
		top: 0;
		width: 2px;
		height: 100%;
		background: #e67e22;
		cursor: pointer;
		z-index: 10;
		transform: translateX(-50%);
	}

	:global(.ws-marker::after) {
		content: '';
		position: absolute;
		top: -1px;
		left: 50%;
		transform: translateX(-50%);
		width: 8px;
		height: 8px;
		background: #e67e22;
		border-radius: 50%;
	}

	:global(.comment.highlight) {
		background: #fffbe6 !important;
		transition: background 0s;
	}

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

	.waveform-wrap {
		position: relative;
		margin-bottom: 0.75rem;
	}

	.waveform { width: 100%; }

	.waveform-loading {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.875rem;
		color: #aaa;
		pointer-events: none;
	}

	.controls {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.controls-left { display: flex; gap: 0.4rem; }

	.ctrl-btn {
		background: none;
		border: 1px solid #ddd;
		border-radius: 6px;
		width: 36px;
		height: 36px;
		font-size: 1rem;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background 0.1s;
	}

	.ctrl-btn:hover:not(:disabled) { background: #f0f0f0; }
	.ctrl-btn:disabled { opacity: 0.4; cursor: not-allowed; }

	.play-btn {
		width: 44px;
		height: 44px;
		font-size: 1.2rem;
		background: #1a1a1a;
		color: white;
		border-color: #1a1a1a;
	}

	.play-btn:hover:not(:disabled) { background: #333; }

	.time {
		font-size: 0.9rem;
		font-variant-numeric: tabular-nums;
		color: #444;
		display: flex;
		gap: 0.25rem;
	}

	.current { font-weight: 700; }
	.sep { color: #aaa; }

	.controls-right { display: flex; align-items: center; }

	.volume-label {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.9rem;
		cursor: pointer;
	}

	.volume-slider {
		width: 80px;
		accent-color: #1a1a1a;
	}

	/* Commentaires */

	h2 { font-size: 1.1rem; margin: 0 0 1rem; }

	.comment-list {
		list-style: none;
		padding: 0;
		margin: 0 0 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.comment {
		border: 1px solid #f0f0f0;
		border-radius: 6px;
		padding: 0.75rem 1rem;
		transition: background 0.6s;
	}

	.comment-header {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin-bottom: 0.35rem;
		font-size: 0.85rem;
	}

	.timestamp-link {
		background: #fff7ed;
		border: 1px solid #fed7aa;
		color: #c2410c;
		border-radius: 4px;
		padding: 0.1rem 0.4rem;
		font-size: 0.78rem;
		cursor: pointer;
		font-weight: 600;
	}

	.timestamp-link:hover { background: #ffedd5; }

	.global-badge {
		font-size: 0.72rem;
		color: #aaa;
		border: 1px solid #e5e5e5;
		border-radius: 3px;
		padding: 0.1rem 0.35rem;
	}

	.comment-date { color: #bbb; font-size: 0.78rem; margin-left: auto; }

	.comment-content {
		font-size: 0.9rem;
		margin: 0;
		white-space: pre-wrap;
		color: #333;
	}

	/* Formulaire */
	.comment-form {
		background: #f8f8f8;
		border: 1px solid #e8e8e8;
		border-radius: 8px;
		padding: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	h3 { font-size: 0.95rem; margin: 0; }

	label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.82rem;
		font-weight: 600;
	}

	input[type='text'], textarea {
		padding: 0.45rem 0.6rem;
		border: 1px solid #ddd;
		border-radius: 4px;
		font-size: 0.9rem;
		font-family: inherit;
		background: white;
	}

	textarea { resize: vertical; }

	.checkbox-label {
		flex-direction: row;
		align-items: center;
		gap: 0.5rem;
		font-weight: 400;
		font-size: 0.875rem;
		cursor: pointer;
	}

	.btn-primary {
		align-self: flex-start;
		padding: 0.5rem 1.25rem;
		background: #1a1a1a;
		color: white;
		border: none;
		border-radius: 4px;
		font-size: 0.9rem;
		cursor: pointer;
	}

	.btn-primary:hover:not(:disabled) { background: #333; }
	.btn-primary:disabled { opacity: 0.45; cursor: not-allowed; }

	.error { color: #c0392b; font-size: 0.85rem; margin: 0; }
	.empty { color: #aaa; font-style: italic; font-size: 0.9rem; }
</style>
