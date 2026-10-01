<script lang="ts">
	import { invalidateAll } from '$app/navigation'
	import Icon from '$lib/components/Icon.svelte'
	import Modal from '$lib/components/Modal.svelte'
	import SongCover from '$lib/components/SongCover.svelte'
	import CatalogSearch, { type CatalogTrack } from '$lib/components/CatalogSearch.svelte'

	// Déposer, remplacer ou retirer la pochette d'un morceau — tout membre du groupe,
	// comme le reste du référentiel. Le bouton se pose dans les actions de l'en-tête.
	let {
		songId,
		title,
		coverVersion,
		searchQuery = ''
	}: {
		songId: number
		title: string
		coverVersion: number | null
		/** Recherche proposée d'emblée dans le catalogue : titre et artiste d'origine. */
		searchQuery?: string
	} = $props()

	let open = $state(false)
	let busy = $state(false)
	let error = $state<string | null>(null)
	let fileInput = $state<HTMLInputElement | null>(null)

	function close() {
		if (busy) return
		open = false
		error = null
	}

	async function upload(event: Event) {
		const input = event.currentTarget as HTMLInputElement
		const file = input.files?.[0]
		input.value = ''
		if (!file) return

		busy = true
		error = null
		try {
			const body = new FormData()
			body.append('cover', file)
			const res = await fetch(`/api/songs/${songId}/cover`, { method: 'POST', body })
			if (!res.ok) {
				error = ((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Erreur ${res.status}.`
				return
			}
			// La page relit la version : toutes les pochettes de ce morceau se mettent à jour.
			await invalidateAll()
			open = false
		} catch {
			error = 'Erreur réseau.'
		} finally {
			busy = false
		}
	}

	// La pochette de l'album d'un titre du catalogue : le serveur va la chercher chez
	// Deezer à partir de l'id, jamais d'une URL fournie par le navigateur.
	async function importFromCatalog(track: CatalogTrack) {
		busy = true
		error = null
		try {
			const res = await fetch(`/api/songs/${songId}/cover`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ deezer_track_id: track.id })
			})
			if (!res.ok) {
				error = ((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Erreur ${res.status}.`
				return
			}
			await invalidateAll()
			open = false
		} catch {
			error = 'Erreur réseau.'
		} finally {
			busy = false
		}
	}

	async function remove() {
		busy = true
		error = null
		try {
			const res = await fetch(`/api/songs/${songId}/cover`, { method: 'DELETE' })
			if (!res.ok) {
				error = ((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Erreur ${res.status}.`
				return
			}
			await invalidateAll()
			open = false
		} catch {
			error = 'Erreur réseau.'
		} finally {
			busy = false
		}
	}
</script>

<button class="btn btn-ghost mh-secondary" onclick={() => (open = true)}>
	<Icon name="image" size="0.9rem" /> <span class="mh-label">Pochette</span>
</button>

{#if open}
	<Modal title="Pochette de « {title} »" onClose={close}>
		<div class="cover-editor">
			<div class="preview">
				<SongCover {songId} {title} size={160} {coverVersion} />
			</div>
			<p class="hint">
				PNG, JPEG, WebP ou GIF, 8 Mo au plus. L'image est recadrée en carré, au centre.
			</p>
			{#if error}<p class="error" role="alert">{error}</p>{/if}

			<input
				bind:this={fileInput}
				type="file"
				accept="image/png,image/jpeg,image/webp,image/gif"
				class="file-input"
				onchange={upload}
				disabled={busy}
			/>
			<div class="actions">
				<button class="btn btn-primary" onclick={() => fileInput?.click()} disabled={busy}>
					<Icon name="upload" size="0.9rem" />
					{busy ? 'Envoi…' : coverVersion === null ? 'Choisir une image' : 'Remplacer'}
				</button>
				{#if coverVersion !== null}
					<!-- Retirer ne perd rien d'irremplaçable : le dégradé revient, et l'image se
					     redépose. Pas de confirmation. -->
					<button class="btn btn-ghost" onclick={remove} disabled={busy}>Retirer</button>
				{/if}
			</div>

			<div class="catalog">
				<CatalogSearch
					initialQuery={searchQuery}
					label="Ou prendre la pochette de l'album sur Deezer"
					autoSearch={!!searchQuery}
					onPick={importFromCatalog}
				/>
			</div>
		</div>
	</Modal>
{/if}

<style>
	.cover-editor {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		padding: 1rem 1.25rem 1.25rem;
		text-align: center;
	}

	.preview {
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-popover);
	}

	.hint { margin: 0; font-size: var(--text-sm); color: var(--color-text-muted); }
	.error { margin: 0; font-size: var(--text-sm); color: var(--color-error); }

	/* Le sélecteur natif est laid et varie d'un navigateur à l'autre : un bouton le
	   déclenche, il reste dans le DOM pour l'accessibilité du formulaire. */
	.file-input {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.5rem;
	}

	.actions .btn { gap: 0.4rem; }

	.catalog { width: 100%; text-align: left; }
</style>
