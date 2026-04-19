<script lang="ts">
	import type { PageData } from './$types'
	import { untrack } from 'svelte'
	import AudioPlayer from '$lib/components/AudioPlayer.svelte'

	let { data }: { data: PageData } = $props()

	type Item = {
		id: number; position: number; note: string | null
		recording_id: number; take: number; duration_s: number | null
		recording_status: string; file_path: string
		song_id: number; song_title: string; song_composer: string | null
		session_id: number; session_date: string; session_location: string | null
	}
	type Playlist = { id: number; name: string; description: string | null }

	const playlist = $derived(data.playlist as unknown as Playlist)
	let items = $state(untrack(() => data.items as unknown as Item[]))
	const peaks = $derived((data as unknown as { peaks: Record<number, number[]> }).peaks)
	const durations = $derived((data as unknown as { durations: Record<number, number | null> }).durations)

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

	// Drag & drop
	let draggedIdx = $state<number | null>(null)
	let dropTargetIdx = $state<number | null>(null)

	function formatTime(s: number) {
		if (!isFinite(s) || !s) return '0:00'
		const m = Math.floor(s / 60)
		return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`
	}

	function formatDate(d: string) {
		return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', {
			day: 'numeric', month: 'short', year: 'numeric'
		})
	}

	function audioUrl(item: Item) {
		return `/audio/${item.recording_id}.mp3`
	}

	// Charger la piste quand currentIdx change manuellement
	function jumpTo(idx: number) {
		if (idx === currentIdx && playerState.ready) {
			toggleToken += 1
			toggleRequest = { token: toggleToken }
			return
		}
		currentIdx = idx
		autoplayTrack = true
	}

	// Drag & drop
	let saveError = $state<string | null>(null)

	function onDragStart(e: DragEvent, idx: number) {
		draggedIdx = idx
		// Nécessaire pour que ondrop se déclenche sur Firefox
		e.dataTransfer?.setData('text/plain', String(idx))
	}
	function onDragOver(e: DragEvent, idx: number) { e.preventDefault(); dropTargetIdx = idx }
	function onDragLeave() { dropTargetIdx = null }
	function onDragEnd() { draggedIdx = null; dropTargetIdx = null }

	async function onDrop(e: DragEvent, toIdx: number) {
		e.preventDefault()
		if (draggedIdx === null || draggedIdx === toIdx) { draggedIdx = null; dropTargetIdx = null; return }

		const fromIdx = draggedIdx
		const newItems = [...items]
		const [moved] = newItems.splice(fromIdx, 1)
		newItems.splice(toIdx, 0, moved)

		// Réajuster currentIdx si la piste en cours a bougé
		if (currentIdx === fromIdx) currentIdx = toIdx
		else if (fromIdx < currentIdx && toIdx >= currentIdx) currentIdx--
		else if (fromIdx > currentIdx && toIdx <= currentIdx) currentIdx++

		items = newItems
		draggedIdx = null
		dropTargetIdx = null

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

	<h1>{playlist.name}</h1>
	{#if playlist.description}<p class="desc">{playlist.description}</p>{/if}

	{#if items.length === 0}
		<p class="empty">Playlist vide. Ajoute des prises depuis le <a href="/sessions">lecteur</a>.</p>
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

			{#if currentTrack}
				<AudioPlayer
					track={currentTrack}
					height={70}
					autoplay={autoplayTrack}
					toggleRequest={toggleRequest}
					onStateChange={(state) => {
						playerState = state
					}}
					onEnded={playNext}
				/>
			{/if}
		</div>

		<!-- Liste des items avec drag & drop -->
		{#if saveError}
			<p class="save-error">{saveError}</p>
		{/if}
		<ul class="items-list">
			{#each items as item, i (item.id)}
				<li
					class="item"
					class:active={i === currentIdx}
					class:drag-over={dropTargetIdx === i && draggedIdx !== i}
					draggable={true}
					ondragstart={(e) => onDragStart(e, i)}
					ondragover={(e) => onDragOver(e, i)}
					ondragleave={onDragLeave}
					ondragend={onDragEnd}
					ondrop={(e) => onDrop(e, i)}
				>
					<span class="drag-handle" aria-hidden="true">⠿</span>
					<button class="item-body" onclick={() => jumpTo(i)}>
						<span class="item-pos">{i + 1}</span>
						<span class="item-info">
							<span class="item-title">{item.song_title}</span>
							<span class="item-meta">
								prise #{item.take} · {formatDate(item.session_date)}
								{#if item.session_location} · {item.session_location}{/if}
								{#if item.duration_s} · {formatTime(item.duration_s)}{/if}
							</span>
							{#if item.note}<span class="item-note">{item.note}</span>{/if}
						</span>
					</button>
					<button
						class="remove-btn"
						onclick={() => removeItem(item.id, i)}
						title="Retirer de la playlist"
					>✕</button>
				</li>
			{/each}
		</ul>
	{/if}
</main>

<style>
	main { max-width: 720px; margin: 2rem auto; padding: 0 1rem; font-family: sans-serif; }

	.breadcrumb { font-size: 0.82rem; color: #888; margin-bottom: 1rem; }
	.breadcrumb a { color: inherit; text-decoration: none; }
	.breadcrumb a:hover { text-decoration: underline; }

	h1 { font-size: 1.4rem; margin: 0 0 0.3rem; }
	.desc { font-size: 0.875rem; color: #666; margin: 0 0 1.5rem; }

	.player-card {
		background: #fafafa; border: 1px solid #e0e0e0;
		border-radius: 8px; padding: 1rem 1.25rem; margin-bottom: 1.5rem;
	}

	.now-playing {
		font-size: 0.82rem; color: #555; margin-bottom: 0.6rem;
		display: flex; align-items: baseline; gap: 0.4rem; flex-wrap: wrap;
	}
	.np-label {
		font-size: 0.7rem; font-weight: 700; text-transform: uppercase;
		background: #1a1a1a; color: white; padding: 0.1rem 0.4rem; border-radius: 3px;
	}

	/* Liste items */
	.items-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 2px; }

	.item {
		display: flex; align-items: center; gap: 0.5rem;
		border: 1px solid #f0f0f0; border-radius: 6px; padding: 0.5rem 0.75rem;
		transition: background 0.1s, border-color 0.1s;
		cursor: default;
	}
	.item.active { background: #f0f7ff; border-color: #bfdbfe; }
	.item.drag-over { border-color: #1a1a1a; border-style: dashed; }
	.item:hover:not(.active) { background: #fafafa; }

	.drag-handle { color: #ccc; cursor: grab; font-size: 1rem; user-select: none; }
	.drag-handle:active { cursor: grabbing; }

	.item-body {
		flex: 1; background: none; border: none; padding: 0; cursor: pointer;
		text-align: left; display: flex; align-items: center; gap: 0.6rem;
	}

	.item-pos { font-size: 0.75rem; color: #bbb; width: 1.5rem; text-align: right; flex-shrink: 0; }
	.item-info { display: flex; flex-direction: column; gap: 0.1rem; }
	.item-title { font-weight: 600; font-size: 0.875rem; }
	.item-meta { font-size: 0.75rem; color: #999; }
	.item-note { font-size: 0.75rem; color: #888; font-style: italic; }

	.remove-btn {
		background: none; border: none; color: #ccc; cursor: pointer;
		font-size: 0.8rem; padding: 0.2rem 0.3rem; border-radius: 3px;
		line-height: 1;
	}
	.remove-btn:hover { color: #c0392b; background: #fef2f2; }

	.empty { color: #bbb; font-style: italic; }
</style>
