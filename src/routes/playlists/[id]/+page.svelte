<script lang="ts">
	import type { PageData } from './$types'
	import { untrack } from 'svelte'
	import AudioPlayer from '$lib/components/AudioPlayer.svelte'
	import PlaylistQueue from '$lib/components/PlaylistQueue.svelte'

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

	let saveError = $state<string | null>(null)

	async function reorderItems(fromIdx: number, toIdx: number) {
		const newItems = [...items]
		const [moved] = newItems.splice(fromIdx, 1)
		newItems.splice(toIdx, 0, moved)

		// Réajuster currentIdx si la piste en cours a bougé
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

		<PlaylistQueue
			items={items}
			currentIndex={currentIdx}
			error={saveError}
			onSelect={jumpTo}
			onReorder={reorderItems}
			onRemove={removeItem}
		/>
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

	.empty { color: #bbb; font-style: italic; }
</style>
