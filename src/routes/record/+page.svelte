<script lang="ts">
	import type { PageData } from './$types'
	import { goto } from '$app/navigation'
	import { formatDateOnly, toDateOnly } from '$lib/date'
	import AudioRecorder from '$lib/components/AudioRecorder.svelte'
	import { clearTakes } from '$lib/recording-store'
	import { createSession, DuplicateError, sendAudioFile, type DuplicateInfo } from '$lib/upload-client'

	/**
	 * Enregistrer d'abord, classer ensuite : en répétition, on lance le micro sans
	 * remplir de formulaire. Session et morceau ne se demandent qu'une fois
	 * l'enregistrement terminé — la copie de secours couvre ce délai.
	 */
	let { data }: { data: PageData } = $props()

	type SessionRow = { id: number; date: string | Date; type: string; title: string | null; location: string | null }
	type SongRow = { id: number; title: string }

	const sessions = $derived(data.sessions as unknown as SessionRow[])
	const songs = $derived(data.songs as unknown as SongRow[])

	// Au-delà, c'est une répétition captée d'un bloc plutôt qu'un morceau isolé.
	const SPLIT_BY_DEFAULT_ABOVE_S = 10 * 60

	const SESSION_TYPES: Record<string, string> = {
		repetition: 'Répétition',
		concert: 'Concert',
		studio: 'Studio',
		autre: 'Autre'
	}

	/** Date du jour dans le fuseau de l'appareil : c'est « aujourd'hui » pour qui enregistre. */
	function localToday(): string {
		const d = new Date()
		const pad = (n: number) => String(n).padStart(2, '0')
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
	}

	let file = $state<File | null>(null)
	let recording = $state(false)

	let selectedSession = $state('')
	let newDate = $state(localToday())
	let newType = $state('repetition')
	let newTitle = $state('')
	let newLocation = $state('')

	let multiTake = $state(false)
	let selectedSong = $state('')

	let uploading = $state(false)
	let progress = $state(0)
	let error = $state<string | null>(null)
	let duplicate = $state<DuplicateInfo | null>(null)

	/**
	 * À chaque enregistrement terminé, on propose le classement le plus probable :
	 * la session du jour si elle existe (sinon une nouvelle, datée d'aujourd'hui), et
	 * la découpe dès que l'enregistrement est long.
	 */
	function onRecorded(recorded: File | null, durationS: number) {
		file = recorded
		error = null
		duplicate = null
		if (!recorded) return
		const today = localToday()
		const todaySession = sessions.find((s) => toDateOnly(s.date) === today)
		selectedSession = todaySession ? String(todaySession.id) : 'new'
		newDate = today
		multiTake = durationS >= SPLIT_BY_DEFAULT_ABOVE_S
	}

	function sessionLabel(s: SessionRow): string {
		const date = formatDateOnly(s.date, { day: '2-digit', month: 'short', year: 'numeric' })
		const detail = s.title || s.location || SESSION_TYPES[s.type] || ''
		return detail ? `${date} — ${detail}` : date
	}

	async function resolveSessionId(): Promise<number> {
		if (selectedSession !== 'new') {
			const id = parseInt(selectedSession)
			if (isNaN(id)) throw new Error('Session invalide.')
			return id
		}
		if (!newDate) throw new Error('Saisis la date de la session.')
		const id = await createSession({
			date: newDate,
			type: newType,
			title: newTitle.trim() || undefined,
			location: newLocation.trim() || undefined
		})
		// La session existe désormais : un nouvel essai (doublon, réseau) ne doit pas
		// en créer une seconde.
		selectedSession = String(id)
		return id
	}

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault()
		if (uploading || !file) return
		error = null
		duplicate = null
		progress = 0

		if (!selectedSession) { error = 'Choisis une session.'; return }
		if (!multiTake && !selectedSong) { error = 'Choisis le morceau joué.'; return }

		uploading = true
		try {
			const sessionId = await resolveSessionId()
			const onProgress = (p: number) => (progress = p)

			if (multiTake) {
				const audioImport = await sendAudioFile<{ id: string }>(
					'/api/imports',
					file,
					{ session_id: String(sessionId) },
					onProgress
				)
				// Le serveur a le fichier : la copie de secours n'a plus lieu d'être.
				await clearTakes().catch(() => {})
				await goto(`/upload/decoupe/${audioImport.id}`)
				return
			}

			const result = await sendAudioFile<{ id: number }>(
				'/api/upload',
				file,
				{ session_id: String(sessionId), song_id: selectedSong },
				onProgress
			)
			await clearTakes().catch(() => {})
			await goto(`/recording/${result.id}`)
		} catch (err) {
			if (err instanceof DuplicateError) duplicate = err.duplicate
			else error = err instanceof Error ? err.message : 'Erreur inattendue.'
		} finally {
			uploading = false
		}
	}
</script>

<svelte:head>
	<title>Enregistrer</title>
</svelte:head>

<main>
	<div class="page-header">
		<h1>Enregistrer</h1>
		<a href="/upload" class="btn btn-ghost btn-sm back-link">Envoyer un fichier</a>
	</div>

	<section class="panel">
		<AudioRecorder
			disabled={uploading}
			onchange={onRecorded}
			onbusychange={(busy) => (recording = busy)}
		/>
	</section>

	{#if file && !recording}
		<form onsubmit={handleSubmit}>
			<h2>Classer l'enregistrement</h2>

			{#if duplicate}
				<div class="message-error">
					Cet enregistrement a déjà été envoyé : <strong>{duplicate.song_title}</strong>,
					prise #{duplicate.take}.
					<a href="/recording/{duplicate.id}">Voir la prise →</a>
				</div>
			{/if}
			{#if error}
				<p class="message-error">{error}</p>
			{/if}

			<label class="form-label">
				Session
				<select class="form-input" bind:value={selectedSession} disabled={uploading} required>
					<option value="new">+ Nouvelle session</option>
					{#each sessions as s}
						<option value={String(s.id)}>{sessionLabel(s)}</option>
					{/each}
				</select>
			</label>

			{#if selectedSession === 'new'}
				<div class="new-session">
					<label class="form-label">
						Type
						<select class="form-input" bind:value={newType} disabled={uploading}>
							{#each Object.entries(SESSION_TYPES) as [value, label]}
								<option {value}>{label}</option>
							{/each}
						</select>
					</label>
					<label class="form-label">
						Date
						<input class="form-input" type="date" bind:value={newDate} required disabled={uploading} />
					</label>
					<label class="form-label wide">
						Titre <span class="hint">(optionnel)</span>
						<input class="form-input" type="text" bind:value={newTitle} placeholder="ex : Répète avant Ducasse" disabled={uploading} />
					</label>
					<label class="form-label wide">
						Lieu <span class="hint">(optionnel)</span>
						<input class="form-input" type="text" bind:value={newLocation} placeholder="Studio, salle…" disabled={uploading} />
					</label>
				</div>
			{/if}

			<fieldset class="content-choice">
				<legend class="form-label">Contenu</legend>
				<label class="check-label">
					<input type="radio" name="content" value={true} bind:group={multiTake} disabled={uploading} />
					<span>
						Plusieurs morceaux
						<span class="hint block">Les blancs sont repérés et chaque passage devient une prise.</span>
					</span>
				</label>
				<label class="check-label">
					<input type="radio" name="content" value={false} bind:group={multiTake} disabled={uploading} />
					<span>Un seul morceau</span>
				</label>
			</fieldset>

			{#if !multiTake}
				{#if songs.length === 0}
					<p class="hint">Aucun morceau disponible. <a href="/songs">Ajouter des morceaux →</a></p>
				{:else}
					<label class="form-label">
						Morceau
						<select class="form-input" bind:value={selectedSong} disabled={uploading} required>
							<option value="" disabled>— Choisir —</option>
							{#each songs as s}
								<option value={String(s.id)}>{s.title}</option>
							{/each}
						</select>
					</label>
				{/if}
			{/if}

			{#if uploading}
				<div class="progress-bar">
					<div class="progress-bar-fill" style="width: {progress}%"></div>
				</div>
				<p class="hint center">
					{#if progress < 100}
						Envoi en cours… {progress}%
					{:else if multiTake}
						Préparation du fichier… (l'analyse des blancs suit)
					{:else}
						Conversion audio en cours…
					{/if}
				</p>
			{/if}

			<button
				type="submit"
				class="btn btn-primary submit-btn"
				disabled={uploading || !selectedSession || (!multiTake && !selectedSong)}
			>
				{#if uploading}
					Envoi en cours…
				{:else if multiTake}
					Envoyer et découper
				{:else}
					Envoyer la prise
				{/if}
			</button>
		</form>
	{/if}
</main>

<style>
	main {
		max-width: 580px;
		margin: 2rem auto;
		padding: 0 1rem;
	}

	.page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1.25rem;
	}

	h1 { font-size: var(--text-xl); margin: 0; }

	h2 {
		font-size: 0.85rem;
		font-weight: 700;
		text-transform: uppercase;
		color: var(--color-text-secondary);
		margin: 0;
	}

	.back-link { color: var(--color-text-muted); }

	.panel {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: 1rem;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin-top: 1.25rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: 1rem;
	}

	.new-session {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}

	.new-session .wide { grid-column: 1 / -1; }

	.content-choice {
		border: 0;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.content-choice legend { padding: 0; margin-bottom: 0.25rem; }

	.check-label {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		font-size: var(--text-sm);
		cursor: pointer;
	}

	.check-label input { margin-top: 0.15rem; }

	.hint {
		font-size: 0.8rem;
		font-weight: 400;
		color: var(--color-text-muted);
		margin: 0;
	}

	.hint.block { display: block; margin-top: 0.15rem; }
	.hint.center { text-align: center; }

	.progress-bar {
		height: 8px;
		background: var(--color-border);
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.progress-bar-fill {
		height: 100%;
		background: var(--color-primary);
		transition: width 0.2s;
	}

	.submit-btn {
		font-size: var(--text-base);
		padding: 0.65rem 1.5rem;
		align-self: flex-start;
	}
</style>
