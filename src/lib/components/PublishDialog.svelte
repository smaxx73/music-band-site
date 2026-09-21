<script lang="ts">
	import Modal from '$lib/components/Modal.svelte'
	import AudioRecorder from '$lib/components/AudioRecorder.svelte'
	import Icon from '$lib/components/Icon.svelte'
	import { clearTakes } from '$lib/recording-store'
	import { sendAudioFile } from '$lib/upload-client'
	import type { PostType } from '$lib/types'

	/**
	 * Publier dans le groupe actif : un enregistrement de l'espace perso, une vidéo
	 * YouTube ou une suggestion de morceau. Toujours le groupe actif — pour un autre
	 * groupe, on bascule d'abord : c'est là qu'on verra la publication et ses réponses.
	 *
	 * Ouverte depuis un enregistrement précis (`initialRecordingId`), elle ne redemande
	 * ni le type ni l'enregistrement : il ne reste que le message à écrire.
	 *
	 * Un enregistrement se publie aussi sans être passé par l'espace perso : déposé ou
	 * enregistré ici, il y est rangé puis publié dans la foulée. Il y reste de toute
	 * façon — la publication le désigne sans le copier.
	 */
	export type PublishChoice = { id: number; title: string; published_here: boolean; has_audio: boolean }
	type Choice = PublishChoice

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

	// Une vidéo déjà rangée dans l'espace se publie « déjà dans mon espace », pas en
	// recollant son lien : c'est pourquoi le lien YouTube se dit « nouveau ».
	const TYPE_LABELS: Record<PostType, string> = {
		recording: 'Enregistrement',
		youtube: 'Nouveau lien YouTube',
		song_suggestion: 'Suggestion de morceau'
	}

	/** D'où vient l'enregistrement publié : de l'espace, ou fait à l'instant. */
	type Source = 'existing' | 'file' | 'record'
	const SOURCES: { value: Source; label: string; icon: 'user' | 'upload' | 'mic' }[] = [
		{ value: 'existing', label: 'Déjà dans mon espace', icon: 'user' },
		{ value: 'file', label: 'Fichier', icon: 'upload' },
		{ value: 'record', label: 'Enregistrer', icon: 'mic' }
	]

	// Valeurs de départ figées à l'ouverture : la modale est recréée à chaque fois.
	// svelte-ignore state_referenced_locally
	let type = $state<PostType>(initialType)
	// svelte-ignore state_referenced_locally
	let recordingId = $state(initialRecordingId !== null ? String(initialRecordingId) : '')
	// Espace vide : il n'y a rien à y choisir, on propose d'emblée de déposer un fichier.
	// svelte-ignore state_referenced_locally
	let source = $state<Source>(recordings.some((r) => !r.published_here) ? 'existing' : 'file')
	let file = $state<File | null>(null)
	let newTitle = $state('')
	let recorderBusy = $state(false)
	let progress = $state<number | null>(null)
	/**
	 * Rangé dans l'espace mais pas encore publié (la publication a échoué) : la suite ne
	 * renvoie pas le fichier, elle ne refait que la publication.
	 */
	let saved = $state<Choice | null>(null)
	let videoUrl = $state('')
	let songTitle = $state('')
	let songArtist = $state('')
	let message = $state('')
	let submitting = $state(false)
	let error = $state<string | null>(null)

	const publishable = $derived(recordings.filter((r) => !r.published_here))
	const locked = $derived(
		saved ?? (initialRecordingId !== null ? recordings.find((r) => r.id === initialRecordingId) ?? null : null)
	)
	const isNew = $derived(!locked && type === 'recording' && source !== 'existing')
	// On ne ferme pas sur un enregistrement en cours ou un envoi : Échap ou un clic à côté
	// ne doivent pas coûter ce qu'on vient de capter.
	const busy = $derived(submitting || recorderBusy)

	function close() {
		if (!busy) onClose()
	}

	function selectSource(next: Source) {
		if (busy) return
		source = next
		file = null
		error = null
	}

	/** Un enregistrement fait sur place porte la date du jour, comme dans l'espace perso. */
	function onRecorded(recorded: File | null) {
		file = recorded
		error = null
		if (recorded && !newTitle.trim()) {
			newTitle = `Enregistrement du ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`
		}
	}

	/** Range le fichier dans l'espace perso, avec le suivi de l'envoi. */
	async function saveToSpace(audio: File): Promise<Choice> {
		progress = 0
		try {
			const created = await sendAudioFile<{ id: number; title: string }>(
				'/api/personal',
				audio,
				{ title: newTitle.trim(), notes: '' },
				(p) => (progress = p)
			)
			// Le serveur a le fichier : la copie de secours de l'enregistreur n'a plus lieu d'être.
			if (source === 'record') await clearTakes().catch(() => {})
			return { id: created.id, title: created.title, published_here: false, has_audio: true }
		} finally {
			progress = null
		}
	}

	/** Si le fichier est déjà dans l'espace, l'erreur le dit : rien n'est perdu, et « Publier » réessaie. */
	function publishError(message: string): string {
		return saved ? `Rangé dans ton espace, mais pas encore publié : ${message}` : message
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault()
		error = null

		let body: Record<string, unknown>
		if (locked) {
			body = { type: 'recording', personal_recording_id: locked.id }
		} else if (isNew) {
			if (!file) { error = source === 'record' ? 'Enregistre d’abord quelque chose.' : 'Choisis un fichier.'; return }
			body = { type: 'recording' }
		} else if (type === 'recording') {
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
			if (isNew && file) {
				try {
					saved = await saveToSpace(file)
				} catch (err) {
					error = err instanceof Error ? err.message : 'Erreur inattendue.'
					return
				}
				body.personal_recording_id = saved.id
			}

			const res = await fetch('/api/posts', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			})
			const json = await res.json().catch(() => ({}))
			if (!res.ok) { error = publishError(json.error ?? `Erreur ${res.status}`); return }
			onPublished(json.id)
		} catch {
			error = publishError('Erreur réseau.')
		} finally {
			submitting = false
		}
	}
</script>

<Modal title={`Publier dans « ${groupName} »`} onClose={close}>
	<form onsubmit={submit}>
		<div class="modal-body fields">
			{#if locked}
				<p class="locked">« {locked.title} »{locked.has_audio ? '' : ' (vidéo)'}</p>
			{:else}
				<div class="type-choice" role="radiogroup" aria-label="Que publier ?">
					{#each TYPES as option (option)}
						<label class="type-option" class:active={type === option}>
							<input type="radio" name="post-type" value={option} bind:group={type} disabled={busy} />
							{TYPE_LABELS[option]}
						</label>
					{/each}
				</div>
			{/if}

			{#if locked}
				<p class="hint">Le groupe l'écoutera depuis ton espace, sans copie : le supprimer retire aussi la publication.</p>
			{:else if type === 'recording'}
				<div class="source-tabs" role="tablist" aria-label="Source">
					{#each SOURCES as option (option.value)}
						<button
							type="button"
							role="tab"
							aria-selected={source === option.value}
							class:active={source === option.value}
							disabled={busy}
							onclick={() => selectSource(option.value)}
						>
							<Icon name={option.icon} size="0.85rem" /> {option.label}
						</button>
					{/each}
				</div>

				{#if source !== 'existing'}
					{#if source === 'file'}
						<label class="form-label">
							Fichier audio
							<input
								class="form-input"
								type="file"
								accept="audio/*"
								disabled={submitting}
								onchange={(e) => (file = (e.currentTarget as HTMLInputElement).files?.[0] ?? null)}
							/>
						</label>
					{:else}
						<AudioRecorder disabled={submitting} onchange={onRecorded} onbusychange={(b) => (recorderBusy = b)} />
					{/if}
					<label class="form-label">
						Titre <span class="optional">{source === 'file' ? '(par défaut : le nom du fichier)' : ''}</span>
						<input class="form-input" type="text" bind:value={newTitle} maxlength="200" disabled={submitting} />
					</label>
					<p class="hint">Rangé dans ton espace, et publié ici sans copie : le supprimer de ton espace retire aussi la publication.</p>
				{:else if publishable.length === 0}
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
			<button type="button" class="btn btn-ghost" onclick={onClose} disabled={busy}>Annuler</button>
			<button
				type="submit"
				class="btn btn-primary"
				disabled={busy || (!locked && type === 'recording' && source === 'existing' && publishable.length === 0)}
			>
				{#if progress !== null}Envoi… {progress} %{:else if submitting}Publication…{:else}Publier{/if}
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

	.source-tabs { display: flex; flex-wrap: wrap; gap: 0.3rem; }
	.source-tabs button {
		display: inline-flex; align-items: center; gap: 0.3rem;
		padding: 0.3rem 0.65rem; border: 1px solid var(--color-border-light); border-radius: var(--radius-md);
		background: none; font: inherit; font-size: var(--text-sm); color: var(--color-text-secondary); cursor: pointer;
	}
	.source-tabs button.active { border-color: var(--color-accent); color: var(--color-accent); font-weight: 600; }
	.source-tabs button:disabled { opacity: 0.6; cursor: default; }

	.locked { margin: 0; font-weight: 600; overflow-wrap: anywhere; }
	.hint { font-size: var(--text-xs); color: var(--color-text-muted); margin: 0; }
	.optional { font-weight: 400; color: var(--color-text-muted); }
	textarea { resize: vertical; }
</style>
