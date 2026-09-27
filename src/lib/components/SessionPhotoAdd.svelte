<script lang="ts">
	import { invalidateAll } from '$app/navigation'
	import Icon from '$lib/components/Icon.svelte'
	import { SESSION_PHOTO_ACCEPT, SESSION_PHOTO_MAX_BYTES } from '$lib/session-photo'

	// Raccourci de l'en-tête tant que la session n'a pas de photo : choisir un fichier
	// suffit, il part aussitôt. Remplacer, retirer ou régler le voile se fait en mode
	// édition (`SessionPhotoField`), pour qu'un clic égaré ne change pas le bandeau.
	let {
		sessionId,
		onError
	}: {
		sessionId: number
		/** Message à afficher sous l'en-tête ; `null` l'efface. */
		onError: (message: string | null) => void
	} = $props()

	let busy = $state(false)
	let fileInput = $state<HTMLInputElement | null>(null)

	async function upload(event: Event) {
		const input = event.currentTarget as HTMLInputElement
		const file = input.files?.[0]
		input.value = ''
		if (!file) return
		if (file.size > SESSION_PHOTO_MAX_BYTES) {
			onError("L'image ne peut pas dépasser 8 Mo.")
			return
		}

		busy = true
		onError(null)
		try {
			const body = new FormData()
			body.append('photo', file)
			const res = await fetch(`/api/sessions/${sessionId}/photo`, { method: 'POST', body })
			if (!res.ok) {
				onError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Erreur ${res.status}.`)
				return
			}
			// La page relit la version : le bandeau prend la photo.
			await invalidateAll()
		} catch {
			onError('Erreur réseau.')
		} finally {
			busy = false
		}
	}
</script>

<input
	bind:this={fileInput}
	type="file"
	accept={SESSION_PHOTO_ACCEPT}
	class="file-input"
	onchange={upload}
	disabled={busy}
/>
<button
	class="btn btn-ghost mh-secondary"
	onclick={() => fileInput?.click()}
	disabled={busy}
	title="Ajouter une photo au bandeau (PNG, JPEG, WebP ou GIF, 8 Mo au plus)"
>
	<Icon name="image" size="0.9rem" /> <span class="mh-label">{busy ? 'Envoi…' : 'Photo'}</span>
</button>

<style>
	/* Le sélecteur natif est laid et varie d'un navigateur à l'autre : le bouton le
	   déclenche. */
	.file-input {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}
</style>
