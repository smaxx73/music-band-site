<script lang="ts">
	import Modal from '$lib/components/Modal.svelte'
	import Icon from '$lib/components/Icon.svelte'

	let {
		songId,
		songStatus,
		label = null,
		open = $bindable(false),
		buttonClass = 'btn btn-secondary btn-sm'
	}: {
		songId: number
		/** Un morceau `abandonne` ne se programme pas — comme il ne s'upload pas. */
		songStatus: string
		/** Libellé visible. `null` = icône seule, pour les grappes de commandes serrées. */
		label?: string | null
		/** Ouvre la modale depuis le parent — une entrée de menu, par exemple. */
		open?: boolean
		buttonClass?: string
	} = $props()

	type Setlist = {
		id: number
		name: string
		song_count: number
		contains_song: boolean
	}

	let setlists = $state<Setlist[]>([])
	let loading = $state(false)
	let addingId = $state<number | null>(null)
	let error = $state<string | null>(null)
	let showCreate = $state(false)
	let newName = $state('')
	let creating = $state(false)

	const programmable = $derived(songStatus !== 'abandonne')

	async function readError(res: Response, fallback: string) {
		const body = await res.json().catch(() => ({})) as { error?: string }
		return body.error ?? fallback
	}

	// L'ouverture vient du bouton ou du parent : le chargement suit l'état, pas le clic.
	$effect(() => {
		if (open) void loadSetlists()
	})

	async function loadSetlists() {
		error = null
		showCreate = false
		newName = ''
		loading = true
		try {
			const res = await fetch(`/api/setlists?song_id=${songId}`)
			if (!res.ok) { error = await readError(res, 'Impossible de charger les setlists.'); return }
			setlists = await res.json() as Setlist[]
		} catch {
			error = 'Erreur réseau.'
		} finally {
			loading = false
		}
	}

	function markAdded(id: number) {
		setlists = setlists.map((setlist) => setlist.id === id
			? { ...setlist, contains_song: true, song_count: setlist.song_count + 1 }
			: setlist
		)
	}

	async function add(setlistId: number) {
		addingId = setlistId
		error = null
		try {
			const res = await fetch(`/api/setlists/${setlistId}/items`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ song_id: songId })
			})
			const body = await res.json().catch(() => ({})) as { code?: string; error?: string }
			if (res.ok || body.code === 'already_added') {
				markAdded(setlistId)
				return
			}
			error = body.error ?? 'Impossible de programmer le morceau.'
		} catch {
			error = 'Erreur réseau.'
		} finally {
			addingId = null
		}
	}

	async function createAndAdd() {
		const name = newName.trim()
		if (!name) { error = 'Donne un nom à la setlist.'; return }

		creating = true
		error = null
		try {
			const res = await fetch('/api/setlists', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name, song_id: songId })
			})
			if (!res.ok) { error = await readError(res, 'Impossible de créer la setlist.'); return }
			const setlist = await res.json() as Setlist
			setlists = [{ ...setlist, song_count: 1, contains_song: true }, ...setlists]
			newName = ''
			showCreate = false
		} catch {
			error = 'Erreur réseau.'
		} finally {
			creating = false
		}
	}
</script>

{#if programmable}
	<button
		class="{buttonClass} setlist-add-button"
		class:btn-icon={!label}
		onclick={() => (open = true)}
		title="Ajouter à une setlist"
		aria-label={label ? undefined : 'Ajouter à une setlist'}
	>
		<Icon name="playlist-add" />
		{#if label}<span>{label}</span>{/if}
	</button>

	{#if open}
		<Modal title="Ajouter à une setlist" size="sm" onClose={() => (open = false)}>
			<div class="setlist-picker">
				{#if error}<p class="modal-error" role="alert">{error}</p>{/if}

				{#if loading}
					<p class="modal-hint">Chargement…</p>
				{:else}
					{#if setlists.length === 0 && !showCreate}
						<p class="modal-hint">Aucune setlist pour l’instant.</p>
					{:else if setlists.length > 0}
						<ul class="modal-list">
							{#each setlists as setlist}
								<li>
									{#if setlist.contains_song}
										<a class="modal-item already-added" href="/setlists/{setlist.id}">
											<span class="modal-name">{setlist.name}</span>
											<span class="modal-count">{setlist.song_count} morceau{setlist.song_count > 1 ? 'x' : ''}</span>
											<span class="modal-check"><Icon name="check" size="0.85rem" /> Déjà programmé</span>
										</a>
									{:else}
										<button class="modal-item" onclick={() => add(setlist.id)} disabled={addingId !== null}>
											<span class="modal-name">{setlist.name}</span>
											<span class="modal-count">{setlist.song_count} morceau{setlist.song_count > 1 ? 'x' : ''}</span>
											{#if addingId === setlist.id}<span class="modal-check">Ajout…</span>{/if}
										</button>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}

					{#if showCreate}
						<form class="create-form" onsubmit={(event) => { event.preventDefault(); createAndAdd() }}>
							<label for="setlist-name-{songId}">Nouvelle setlist</label>
							<div class="create-controls">
								<input id="setlist-name-{songId}" bind:value={newName} maxlength="120" placeholder="Ex. Concert du 14 juillet" disabled={creating} />
								<button class="btn btn-primary btn-sm" disabled={creating}>{creating ? 'Création…' : 'Créer et ajouter'}</button>
							</div>
						</form>
					{:else}
						<button class="btn btn-ghost btn-sm create-trigger" onclick={() => (showCreate = true)}>+ Créer une setlist</button>
					{/if}
				{/if}
			</div>
		</Modal>
	{/if}
{/if}

<style>
	.setlist-picker { min-width: min(100%, 24rem); }
	.setlist-add-button { gap: 0.35rem; }
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
