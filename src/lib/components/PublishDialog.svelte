<script lang="ts">
	import Modal from '$lib/components/Modal.svelte'
	import type { PostType } from '$lib/types'

	/**
	 * Publier dans le groupe actif : un enregistrement de l'espace perso, une vidéo
	 * YouTube ou une suggestion de morceau. Toujours le groupe actif — pour un autre
	 * groupe, on bascule d'abord : c'est là qu'on verra la publication et ses réponses.
	 *
	 * Ouverte depuis un enregistrement précis (`initialRecordingId`), elle ne redemande
	 * ni le type ni l'enregistrement : il ne reste que le message à écrire.
	 */
	type Choice = { id: number; title: string; published_here: boolean; has_audio: boolean }

	let {
		groupName,
		recordings,
		initialType = 'recording',
		initialRecordingId = null,
		onClose,
		onPublished
	}: {
		groupName: string
		recordings: Choice[]
		initialType?: PostType
		initialRecordingId?: number | null
		onClose: () => void
		onPublished: (postId: number) => void
	} = $props()

	const TYPES: PostType[] = ['recording', 'youtube', 'song_suggestion']

	// Une vidéo déjà rangée dans l'espace se publie « depuis mon espace », pas en
	// recollant son lien : les libellés le disent, là où « Vidéo » laissait croire
	// l'inverse.
	const TYPE_LABELS: Record<PostType, string> = {
		recording: 'Depuis mon espace',
		youtube: 'Nouveau lien YouTube',
		song_suggestion: 'Suggestion de morceau'
	}

	// Valeurs de départ figées à l'ouverture : la modale est recréée à chaque fois.
	// svelte-ignore state_referenced_locally
	let type = $state<PostType>(initialType)
	// svelte-ignore state_referenced_locally
	let recordingId = $state(initialRecordingId !== null ? String(initialRecordingId) : '')
	let videoUrl = $state('')
	let songTitle = $state('')
	let songArtist = $state('')
	let message = $state('')
	let submitting = $state(false)
	let error = $state<string | null>(null)

	const publishable = $derived(recordings.filter((r) => !r.published_here))
	const locked = $derived(
		initialRecordingId !== null ? recordings.find((r) => r.id === initialRecordingId) ?? null : null
	)

	async function submit(event: SubmitEvent) {
		event.preventDefault()
		error = null

		let body: Record<string, unknown>
		if (type === 'recording') {
			if (!recordingId) { error = 'Choisis un enregistrement.'; return }
			body = { type, personal_recording_id: Number(recordingId) }
		} else if (type === 'youtube') {
			if (!videoUrl.trim()) { error = 'Colle le lien de la vidéo.'; return }
			body = { type, video_url: videoUrl.trim() }
		} else {
			if (!songTitle.trim()) { error = 'Le titre du morceau est obligatoire.'; return }
			body = {
				type,
				song_title: songTitle.trim(),
				song_artist: songArtist.trim() || null,
				video_url: videoUrl.trim() || null
			}
		}
		body.message = message.trim() || null

		submitting = true
		try {
			const res = await fetch('/api/posts', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			})
			const json = await res.json().catch(() => ({}))
			if (!res.ok) { error = json.error ?? `Erreur ${res.status}`; return }
			onPublished(json.id)
		} catch {
			error = 'Erreur réseau.'
		} finally {
			submitting = false
		}
	}
</script>

<Modal title={`Publier dans « ${groupName} »`} {onClose}>
	<form onsubmit={submit}>
		<div class="modal-body fields">
			{#if locked}
				<p class="locked">« {locked.title} »{locked.has_audio ? '' : ' (vidéo)'}</p>
			{:else}
				<div class="type-choice" role="radiogroup" aria-label="Que publier ?">
					{#each TYPES as option (option)}
						<label class="type-option" class:active={type === option}>
							<input type="radio" name="post-type" value={option} bind:group={type} disabled={submitting} />
							{TYPE_LABELS[option]}
						</label>
					{/each}
				</div>
			{/if}

			{#if locked}
				<p class="hint">Le groupe l'écoutera depuis ton espace, sans copie : le supprimer retire aussi la publication.</p>
			{:else if type === 'recording'}
				{#if publishable.length === 0}
					<p class="hint">
						{recordings.length === 0
							? 'Ton espace est vide : ajoute d’abord un enregistrement.'
							: 'Tous tes enregistrements sont déjà publiés dans ce groupe.'}
					</p>
				{:else}
					<label class="form-label">
						Enregistrement
						<select class="form-input" bind:value={recordingId} disabled={submitting}>
							<option value="">— Choisir —</option>
							{#each publishable as r (r.id)}
								<option value={String(r.id)}>{r.title}{r.has_audio ? '' : ' (vidéo)'}</option>
							{/each}
						</select>
					</label>
					<p class="hint">Le groupe l'écoutera depuis ton espace, sans copie : le supprimer retire aussi la publication.</p>
				{/if}
			{:else if type === 'youtube'}
				<label class="form-label">
					Lien de la vidéo
					<input class="form-input" type="url" bind:value={videoUrl} placeholder="https://youtu.be/…" disabled={submitting} />
				</label>
			{:else}
				<label class="form-label">
					Titre du morceau
					<input class="form-input" type="text" bind:value={songTitle} maxlength="200" disabled={submitting} />
				</label>
				<label class="form-label">
					Artiste d'origine <span class="optional">(facultatif)</span>
					<input class="form-input" type="text" bind:value={songArtist} maxlength="200" disabled={submitting} />
				</label>
				<label class="form-label">
					Lien YouTube pour l'écouter <span class="optional">(facultatif)</span>
					<input class="form-input" type="url" bind:value={videoUrl} placeholder="https://youtu.be/…" disabled={submitting} />
				</label>
				<p class="hint">La suggestion n'entre au référentiel que si un membre l'y ajoute.</p>
			{/if}

			<label class="form-label">
				Message <span class="optional">(facultatif)</span>
				<textarea class="form-input" rows="3" bind:value={message} maxlength="2000" disabled={submitting}
					placeholder="Ce que tu veux que le groupe en retienne…"></textarea>
			</label>

			{#if error}<p class="message-error" role="alert">{error}</p>{/if}
		</div>

		<div class="modal-footer">
			<button type="button" class="btn btn-ghost" onclick={onClose} disabled={submitting}>Annuler</button>
			<button
				type="submit"
				class="btn btn-primary"
				disabled={submitting || (type === 'recording' && publishable.length === 0)}
			>
				{submitting ? 'Publication…' : 'Publier'}
			</button>
		</div>
	</form>
</Modal>

<style>
	.fields { display: flex; flex-direction: column; gap: var(--space-3); }

	.type-choice { display: flex; flex-wrap: wrap; gap: 0.4rem; }
	.type-option {
		display: inline-flex; align-items: center; gap: 0.35rem;
		padding: 0.35rem 0.7rem; border: 1px solid var(--color-border-input);
		border-radius: 999px; font-size: var(--text-sm); cursor: pointer;
	}
	.type-option.active { border-color: var(--color-primary); background: var(--color-bg-muted); font-weight: 600; }
	/* Le rond natif doublerait la pastille, qui dit déjà ce qui est choisi. */
	.type-option input { position: absolute; opacity: 0; pointer-events: none; }
	.type-option:has(input:focus-visible) { outline: 2px solid var(--color-accent); outline-offset: 2px; }

	.locked { margin: 0; font-weight: 600; overflow-wrap: anywhere; }
	.hint { font-size: var(--text-xs); color: var(--color-text-muted); margin: 0; }
	.optional { font-weight: 400; color: var(--color-text-muted); }
	textarea { resize: vertical; }
</style>
