<script lang="ts">
	import Modal from '$lib/components/Modal.svelte'

	let {
		recordingId,
		hasAudio,
		label = '+ Playlist',
		buttonClass = 'btn btn-secondary btn-sm'
	}: {
		recordingId: number
		hasAudio: boolean
		label?: string
		buttonClass?: string
	} = $props()

	type Playlist = {
		id: number
		name: string
		item_count: number
		contains_recording: boolean
	}

	let open = $state(false)
	let playlists = $state<Playlist[]>([])
	let loading = $state(false)
	let addingId = $state<number | null>(null)
	let error = $state<string | null>(null)
	let showCreate = $state(false)
	let newName = $state('')
	let creating = $state(false)

	async function readError(res: Response, fallback: string) {
		const body = await res.json().catch(() => ({})) as { error?: string }
		return body.error ?? fallback
	}

	async function show() {
		open = true
		error = null
		showCreate = false
		newName = ''
		loading = true
		try {
			const res = await fetch(`/api/playlists?recording_id=${recordingId}`)
			if (!res.ok) { error = await readError(res, 'Impossible de charger les playlists.'); return }
			playlists = await res.json() as Playlist[]
		} catch {
			error = 'Erreur réseau.'
		} finally {
			loading = false
		}
	}

	function markAdded(id: number) {
		playlists = playlists.map((playlist) => playlist.id === id
			? { ...playlist, contains_recording: true, item_count: playlist.item_count + 1 }
			: playlist
		)
	}

	async function add(playlistId: number) {
		addingId = playlistId
		error = null
		try {
			const res = await fetch(`/api/playlists/${playlistId}/items`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ recording_id: recordingId })
			})
			const body = await res.json().catch(() => ({})) as { code?: string; error?: string }
			if (res.ok || body.code === 'already_added') {
				markAdded(playlistId)
				return
			}
			error = body.error ?? 'Impossible d’ajouter la prise.'
		} catch {
			error = 'Erreur réseau.'
		} finally {
			addingId = null
		}
	}

	async function createAndAdd() {
		const name = newName.trim()
		if (!name) { error = 'Donne un nom à la playlist.'; return }

		creating = true
		error = null
		try {
			const res = await fetch('/api/playlists', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name, recording_id: recordingId })
			})
			if (!res.ok) { error = await readError(res, 'Impossible de créer la playlist.'); return }
			const playlist = await res.json() as Playlist
			playlists = [{ ...playlist, item_count: 1, contains_recording: true }, ...playlists]
			newName = ''
			showCreate = false
		} catch {
			error = 'Erreur réseau.'
		} finally {
			creating = false
		}
	}
</script>

{#if hasAudio}
	<button class={buttonClass} onclick={show}>{label}</button>

	{#if open}
		<Modal title="Ajouter à une playlist" size="sm" onClose={() => (open = false)}>
			<div class="playlist-picker">
				{#if error}<p class="modal-error" role="alert">{error}</p>{/if}

				{#if loading}
					<p class="modal-hint">Chargement…</p>
				{:else}
					{#if playlists.length === 0 && !showCreate}
						<p class="modal-hint">Aucune playlist pour l’instant.</p>
					{:else if playlists.length > 0}
						<ul class="modal-list">
							{#each playlists as playlist}
								<li>
									{#if playlist.contains_recording}
										<a class="modal-item already-added" href="/playlists/{playlist.id}">
											<span class="modal-name">{playlist.name}</span>
											<span class="modal-count">{playlist.item_count} prise{playlist.item_count > 1 ? 's' : ''}</span>
											<span class="modal-check">✓ Déjà ajoutée</span>
										</a>
									{:else}
										<button class="modal-item" onclick={() => add(playlist.id)} disabled={addingId !== null}>
											<span class="modal-name">{playlist.name}</span>
											<span class="modal-count">{playlist.item_count} prise{playlist.item_count > 1 ? 's' : ''}</span>
											{#if addingId === playlist.id}<span class="modal-check">Ajout…</span>{/if}
										</button>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}

					{#if showCreate}
						<form class="create-form" onsubmit={(event) => { event.preventDefault(); createAndAdd() }}>
							<label for="playlist-name-{recordingId}">Nouvelle playlist</label>
							<div class="create-controls">
								<input id="playlist-name-{recordingId}" bind:value={newName} maxlength="120" placeholder="Ex. Set concert" disabled={creating} />
								<button class="btn btn-primary btn-sm" disabled={creating}>{creating ? 'Création…' : 'Créer et ajouter'}</button>
							</div>
						</form>
					{:else}
						<button class="btn btn-ghost btn-sm create-trigger" onclick={() => (showCreate = true)}>+ Créer une playlist</button>
					{/if}
				{/if}
			</div>
		</Modal>
	{/if}
{/if}

<style>
	.playlist-picker { min-width: min(100%, 24rem); }
	.modal-list { list-style: none; padding: 0.35rem 0; margin: 0; max-height: 18rem; overflow-y: auto; }
	.modal-item {
		box-sizing: border-box; width: 100%; background: none; border: 0; padding: 0.7rem 1.25rem;
		display: flex; align-items: center; gap: 0.65rem; cursor: pointer; text-align: left;
		color: inherit; text-decoration: none; font: inherit;
	}
	.modal-item:hover:not(:disabled) { background: var(--color-bg-subtle); }
	.modal-item:disabled { cursor: wait; opacity: var(--disabled-opacity); }
	.already-added { color: var(--color-text-secondary); }
	.already-added:hover { text-decoration: none; }
	.modal-name { flex: 1; font-size: var(--text-sm); font-weight: 600; }
	.modal-count, .modal-check { font-size: var(--text-xs); color: var(--color-text-muted); white-space: nowrap; }
	.modal-check { color: var(--color-repertoire-text); font-weight: 700; }
	.modal-hint, .modal-error { padding: 0.75rem 1.25rem; font-size: var(--text-sm); margin: 0; }
	.modal-hint { color: var(--color-text-muted); }
	.modal-error { color: var(--color-error); }
	.create-trigger { margin: 0.35rem 1.25rem 0.8rem; }
	.create-form { border-top: 1px solid var(--color-border-light); padding: 0.9rem 1.25rem; }
	.create-form label { display: block; font-size: var(--text-sm); font-weight: 600; margin-bottom: 0.35rem; }
	.create-controls { display: flex; gap: 0.45rem; }
	.create-controls input { min-width: 0; flex: 1; }
</style>
