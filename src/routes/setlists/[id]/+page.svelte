<script lang="ts">
	import type { PageData } from './$types'
	import { onMount, untrack } from 'svelte'
	import { goto, invalidateAll } from '$app/navigation'
	import { formatDateTimeFull } from '$lib/date'
	import {
		canDeleteGroupContent,
		formatSetlistDuration,
		setlistDuration,
		type SetlistItemView,
		type SongStatus
	} from '$lib/types'
	import SetlistSongs from '$lib/components/SetlistSongs.svelte'
	import CommentsPanel from '$lib/components/CommentsPanel.svelte'
	import Modal from '$lib/components/Modal.svelte'
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte'
	import type { MentionMember } from '$lib/components/MentionTextarea.svelte'
	import type { CommentWithReactions } from '$lib/types'

	let { data }: { data: PageData } = $props()

	type Setlist = {
		id: number
		name: string
		description: string | null
		created_by: string
		created_by_user_id: number | null
		created_at: string
	}
	type AvailableSong = {
		id: number
		title: string
		composer: string | null
		key: string | null
		status: SongStatus
		reference_duration_s: number | null
		in_setlist: boolean
	}

	const setlist = $derived(data.setlist as unknown as Setlist)
	let items = $state(untrack(() => data.items as unknown as SetlistItemView[]))
	let availableSongs = $state(untrack(() => data.availableSongs as unknown as AvailableSong[]))
	let comments = $state(untrack(() => data.comments as unknown as CommentWithReactions[]))
	const groupMembers = $derived(data.groupMembers as unknown as MentionMember[])

	// Le total est la somme des durées de référence connues : celles qui manquent sont
	// comptées à part, et le « ≈ » du libellé dit que le total est un plancher.
	const total = $derived(setlistDuration(items))

	const canDelete = $derived(
		canDeleteGroupContent(
			data.user,
			data.user?.current_group_id,
			setlist.created_by_user_id
		)
	)

	let saveError = $state<string | null>(null)
	let busy = $state(false)

	// ─── Nom et description ────────────────────────────────────────────────
	let editing = $state(false)
	let nameDraft = $state('')
	let descDraft = $state('')
	let savingInfo = $state(false)
	let infoError = $state<string | null>(null)
	// Le programme est un brouillon pendant l'édition : retirer ou déplacer un morceau ne
	// touche la base qu'au clic sur « Enregistrer ».
	let itemsBeforeEdit = $state<SetlistItemView[]>([])
	let songsBeforeEdit = $state<AvailableSong[]>([])
	let removedItemIds = $state<number[]>([])
	let pendingSongIds = $state<number[]>([])
	let confirmCancelOpen = $state(false)
	let confirmDeleteOpen = $state(false)

	function startEdit() {
		nameDraft = setlist.name
		descDraft = setlist.description ?? ''
		infoError = null
		saveError = null
		itemsBeforeEdit = [...items]
		songsBeforeEdit = [...availableSongs]
		removedItemIds = []
		pendingSongIds = []
		editing = true
	}

	function cancelEdit() {
		confirmCancelOpen = true
	}

	function discardEdit() {
		items = itemsBeforeEdit
		availableSongs = songsBeforeEdit
		removedItemIds = []
		pendingSongIds = []
		infoError = null
		saveError = null
		editing = false
		confirmCancelOpen = false
	}

	async function saveInfo(event: SubmitEvent) {
		event.preventDefault()
		if (!nameDraft.trim()) { infoError = 'Le nom est obligatoire.'; return }
		savingInfo = true
		infoError = null
		try {
			const res = await fetch(`/api/setlists/${setlist.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: nameDraft.trim(), description: descDraft.trim() || null })
			})
			const json = await res.json().catch(() => ({}))
			if (!res.ok) { infoError = json.error ?? 'Erreur.'; return }
			busy = true
			if (!await saveProgram()) return
			editing = false
			await invalidateAll()
		} catch {
			infoError = 'Erreur réseau.'
		} finally {
			busy = false
			savingInfo = false
		}
	}

	// ─── Programme ─────────────────────────────────────────────────────────
	async function savePositions(): Promise<boolean> {
		if (!editing) return false
		saveError = null
		const payload = items.map((item, i) => ({ id: item.id, position: i + 1 }))
		const res = await fetch(`/api/setlists/${setlist.id}/items`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		})
		if (!res.ok) {
			const body = await res.json().catch(() => ({}))
			saveError = (body as { error?: string }).error ?? `Erreur ${res.status}`
			return false
		}
		return true
	}

	async function saveProgram(): Promise<boolean> {
		for (const itemId of removedItemIds) {
			const res = await fetch(`/api/setlists/${setlist.id}/items/${itemId}`, { method: 'DELETE' })
			if (!res.ok) {
				const body = await res.json().catch(() => ({}))
				saveError = (body as { error?: string }).error ?? `Erreur ${res.status}`
				return false
			}
			// En cas d'échec plus loin, une nouvelle tentative ne doit pas supprimer à
			// nouveau cet item déjà confirmé. Le brouillon annulable suit donc aussi cet état.
			const removed = itemsBeforeEdit.find((item) => item.id === itemId)
			removedItemIds = removedItemIds.filter((id) => id !== itemId)
			itemsBeforeEdit = itemsBeforeEdit.filter((item) => item.id !== itemId)
			if (removed) {
				songsBeforeEdit = songsBeforeEdit.map((song) =>
					song.id === removed.song_id ? { ...song, in_setlist: false } : song
				)
			}
		}
		for (const songId of pendingSongIds) {
			const res = await fetch(`/api/setlists/${setlist.id}/items`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ song_id: songId })
			})
			const body = await res.json().catch(() => ({})) as { id?: number; position?: number; error?: string }
			if (!res.ok || body.id === undefined || body.position === undefined) {
				saveError = body.error ?? "Impossible d'ajouter le morceau."
				return false
			}
			const itemId = body.id
			const position = body.position
			items = items.map((item) => item.id === -songId
				? { ...item, id: itemId, position }
				: item)
		}
		// Une setlist vide n'a aucune position à réécrire. Envoyer [] négativerait toutes
		// les positions restantes côté API, ce qui n'est pas un état valide à conserver.
		if (items.length > 0 && !await savePositions()) return false
		removedItemIds = []
		pendingSongIds = []
		return true
	}

	function reorder(fromIdx: number, toIdx: number) {
		if (!editing) return
		if (toIdx < 0 || toIdx >= items.length || fromIdx === toIdx) return
		const next = [...items]
		const [moved] = next.splice(fromIdx, 1)
		next.splice(toIdx, 0, moved)
		items = next.map((item, i) => ({ ...item, position: i + 1 }))
	}

	function removeItem(itemId: number, idx: number) {
		if (!editing) return
		saveError = null
		const removed = items[idx]
		if (!removed || removed.id !== itemId) return
		if (itemId > 0) removedItemIds = [...removedItemIds, itemId]
		else pendingSongIds = pendingSongIds.filter((songId) => songId !== removed.song_id)
		items = items.filter((_, i) => i !== idx).map((item, i) => ({ ...item, position: i + 1 }))
		availableSongs = availableSongs.map((song) =>
			song.id === removed.song_id ? { ...song, in_setlist: false } : song
		)
	}

	// ─── Ajout de morceaux ─────────────────────────────────────────────────
	let showAddModal = $state(false)
	let addQuery = $state('')
	let addError = $state<string | null>(null)

	const selectableSongs = $derived(availableSongs.filter((song) => {
		if (song.in_setlist) return false
		const query = addQuery.trim().toLocaleLowerCase('fr-FR')
		return !query || `${song.title} ${song.composer ?? ''}`.toLocaleLowerCase('fr-FR').includes(query)
	}))

	function openAddModal() {
		if (!editing) return
		showAddModal = true
		addQuery = ''
		addError = null
	}

	function addSong(song: AvailableSong) {
		if (!editing) return
		addError = null
		const newItem = {
			id: -song.id,
			setlist_id: setlist.id,
			song_id: song.id,
			position: items.length + 1,
			song_title: song.title,
			song_composer: song.composer,
			song_key: song.key,
			song_status: song.status,
			reference_duration_s: song.reference_duration_s
		} as SetlistItemView
		items = [...items, newItem]
		pendingSongIds = [...pendingSongIds, song.id]
		availableSongs = availableSongs.map((candidate) =>
			candidate.id === song.id ? { ...candidate, in_setlist: true } : candidate
		)
	}

	// Le « 🔗 » d'un commentaire produit `/setlists/3#comment-12` : la cible peut être
	// repliée parmi les plus anciens, et l'ancre du navigateur ne la trouverait pas.
	// La liste la déplie et la met en évidence, comme sur la page d'une prise.
	let highlightRequest = $state<{ id: number; token: number } | null>(null)

	onMount(() => {
		const targeted = location.hash.match(/^#comment-(\d+)$/)
		if (!targeted) return
		highlightRequest = { id: Number(targeted[1]), token: 1 }
	})

	// ─── Suppression ───────────────────────────────────────────────────────
	let deleting = $state(false)

	async function deleteSetlist() {
		deleting = true
		try {
			const res = await fetch(`/api/setlists/${setlist.id}`, { method: 'DELETE' })
			if (!res.ok) {
				const body = await res.json().catch(() => ({}))
				saveError = (body as { error?: string }).error ?? `Erreur ${res.status}`
				return
			}
			await goto('/setlists')
		} finally {
			deleting = false
			confirmDeleteOpen = false
		}
	}
</script>


<svelte:head>
	<title>{setlist.name}</title>
</svelte:head>

<!-- Le programme et les informations forment un seul objet : en édition, ils tiennent
     dans la même boîte, et « Enregistrer » la referme d'un bloc. Sortis de la boîte,
     les morceaux se retouchaient sans que rien ne dise à quoi le bouton s'appliquait. -->
{#snippet programMeta()}
	<span class="program-meta">
		{items.length} morceau{items.length > 1 ? 'x' : ''}
		{#if items.length > 0}· {formatSetlistDuration(total)}{/if}
	</span>
{/snippet}

{#snippet durationHint()}
	{#if total.missing > 0}
		<p class="hint">
			{total.missing} morceau{total.missing > 1 ? 'x' : ''} sans durée de référence :
			le total est un minimum. La durée se renseigne dans <a href="/songs">Morceaux</a>.
		</p>
	{/if}
{/snippet}

<main>
	<nav class="breadcrumb">
		<a href="/setlists">Setlists</a> / <span>{setlist.name}</span>
	</nav>

	{#if editing}
		<form class="form-section editor" onsubmit={saveInfo}>
			{#if infoError}<p class="message-error">{infoError}</p>{/if}
			<label class="form-label">
				Nom
				<input class="form-input" type="text" bind:value={nameDraft} required disabled={savingInfo} />
			</label>
			<label class="form-label">
				Description
				<input class="form-input" type="text" bind:value={descDraft} disabled={savingInfo} />
			</label>

			<div class="program">
				<div class="program-head">
					<h2>Programme</h2>
					{@render programMeta()}
					<button type="button" class="btn btn-secondary btn-sm add-btn" onclick={openAddModal}>
						+ Ajouter des morceaux
					</button>
				</div>
				{@render durationHint()}
				{#if items.length === 0}
					<p class="empty">Cette setlist est vide.</p>
				{:else}
					<SetlistSongs
						{items}
						editable
						surface="tray"
						error={saveError}
						{busy}
						onReorder={reorder}
						onRemove={removeItem}
					/>
				{/if}
			</div>

			<div class="form-actions">
				<button type="submit" class="btn btn-primary" disabled={savingInfo}>
					{savingInfo ? 'Enregistrement…' : 'Enregistrer'}
				</button>
				<button type="button" class="btn btn-ghost" disabled={savingInfo} onclick={cancelEdit}>
					Annuler
				</button>
			</div>
		</form>
	{:else}
		<div class="setlist-header">
			<div>
				<h1>{setlist.name}</h1>
				{#if setlist.description}<p class="desc">{setlist.description}</p>{/if}
				<p class="meta">créée par {setlist.created_by} le {formatDateTimeFull(setlist.created_at)}</p>
			</div>
			<div class="setlist-actions">
				<button class="btn btn-secondary btn-sm" onclick={startEdit}>Modifier</button>
				{#if canDelete}
					<button class="btn btn-danger btn-sm" disabled={deleting} onclick={() => (confirmDeleteOpen = true)}>
						{deleting ? 'Suppression…' : 'Supprimer'}
					</button>
				{/if}
			</div>
		</div>

		<!-- Hors édition, la seule erreur possible vient de la suppression : elle se lit
		     près du bouton qui l'a provoquée, pas au milieu du programme. -->
		{#if saveError}<p class="message-error">{saveError}</p>{/if}

		<div class="program">
			<div class="program-head">
				<h2>Programme</h2>
				{@render programMeta()}
			</div>
			{@render durationHint()}
			{#if items.length === 0}
				<p class="empty">Cette setlist est vide.</p>
			{:else}
				<SetlistSongs {items} />
			{/if}
		</div>
	{/if}

	<!-- Les commentaires sont une autre discussion que le programme : le filet et la
	     respiration disent où l'un finit et où l'autre commence. -->
	<div class="comments">
		<CommentsPanel
			thread={{ kind: 'setlist', id: setlist.id }}
			{comments}
			members={groupMembers}
			{highlightRequest}
			onCommentsChange={(updated) => { comments = updated }}
		/>
	</div>

	<ConfirmDialog
		open={confirmCancelOpen}
		level="warning"
		title="Annuler les modifications ?"
		message="Les changements apportés au programme et aux informations de la setlist seront perdus."
		confirmLabel="Abandonner les modifications"
		onConfirm={discardEdit}
		onCancel={() => (confirmCancelOpen = false)}
	/>
	<ConfirmDialog
		open={confirmDeleteOpen}
		level="danger"
		title="Supprimer cette setlist ?"
		message={`La setlist « ${setlist.name} » et tous ses commentaires seront définitivement supprimés.`}
		confirmLabel="Supprimer la setlist"
		busy={deleting}
		onConfirm={deleteSetlist}
		onCancel={() => (confirmDeleteOpen = false)}
	/>

	{#if showAddModal}
		<Modal title="Ajouter des morceaux" onClose={() => (showAddModal = false)}>
			<div class="add-modal-content">
				<p class="modal-hint">Les morceaux abandonnés ne sont pas proposés.</p>
				<input class="song-search" bind:value={addQuery} placeholder="Rechercher un morceau…" />
				{#if addError}<p class="modal-error" role="alert">{addError}</p>{/if}
				{#if selectableSongs.length === 0}
					<p class="modal-hint">
						{availableSongs.some((song) => !song.in_setlist)
							? 'Aucun morceau ne correspond à cette recherche.'
							: 'Tous les morceaux du répertoire sont déjà dans cette setlist.'}
					</p>
				{:else}
					<ul class="song-options">
						{#each selectableSongs as song (song.id)}
							<li>
								<button onclick={() => addSong(song)}>
									<span><strong>{song.title}</strong>{#if song.composer} · {song.composer}{/if}</span>
									<span class="song-option-meta">
										{#if song.key}{song.key}{/if}
									</span>
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

	.setlist-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 1.5rem; }
	h1 { font-size: 1.4rem; margin: 0 0 0.3rem; }
	.desc { font-size: var(--text-sm); color: #666; margin: 0 0 0.3rem; }
	.meta { font-size: var(--text-xs); color: var(--color-text-muted); margin: 0; }
	.hint { font-size: var(--text-xs); color: var(--color-text-muted); margin: 0 0 0.6rem; }

	.setlist-actions { display: flex; gap: 0.4rem; flex-wrap: wrap; flex-shrink: 0; }

	/* En édition, le programme est un bloc de la boîte : le filet du haut le détache
	   des champs sans lui donner un second cadre à l'intérieur du premier. */
	.editor .program { border-top: 1px solid var(--color-border-light); padding-top: var(--space-3); }

	.program-head { display: flex; align-items: baseline; flex-wrap: wrap; gap: 0.3rem 0.6rem; margin-bottom: 0.6rem; }
	.program-head h2 { font-size: var(--text-lg); margin: 0; }
	.program-meta { font-size: var(--text-xs); color: var(--color-text-muted); }
	/* Poussé à droite, l'ajout reste à hauteur du titre qu'il complète. */
	.add-btn { margin-left: auto; }

	.empty { margin: 0.5rem 0; }

	.comments { margin-top: var(--space-8); padding-top: var(--space-5); border-top: 1px solid var(--color-border-light); }

	.add-modal-content { padding: 0.9rem 1.25rem 1.25rem; }
	.modal-hint, .modal-error { font-size: var(--text-sm); margin: 0 0 0.75rem; }
	.modal-hint { color: var(--color-text-muted); }
	.modal-error { color: var(--color-error); }
	.song-search { box-sizing: border-box; width: 100%; margin-bottom: 0.5rem; }
	.song-options { list-style: none; padding: 0; margin: 0; max-height: min(55vh, 25rem); overflow-y: auto; }
	.song-options button {
		width: 100%; padding: 0.7rem 0.15rem; border: 0; border-top: 1px solid var(--color-border-light);
		background: transparent; color: inherit; text-align: left; font: inherit; cursor: pointer;
		display: flex; justify-content: space-between; gap: 1rem;
	}
	.song-options button:hover:not(:disabled) { color: var(--color-accent); }
	.song-options button:disabled { cursor: wait; opacity: var(--disabled-opacity); }
	.song-option-meta { color: var(--color-text-muted); font-size: var(--text-xs); white-space: nowrap; }

	@media (max-width: 640px) {
		main { margin: 1rem auto; padding: 0 0.75rem; }
		h1 { font-size: 1.2rem; }
		.setlist-header { align-items: stretch; flex-direction: column; }
		/* Le bouton d'ajout prend sa propre ligne plutôt que de serrer le titre. */
		.add-btn { margin-left: 0; width: 100%; }
		.song-options button { align-items: flex-start; flex-direction: column; gap: 0.2rem; }
	}
</style>
