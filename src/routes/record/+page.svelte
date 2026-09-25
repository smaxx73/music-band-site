<script lang="ts">
	import type { PageData } from './$types'
	import { goto } from '$app/navigation'
	import { formatDateOnly, toDateOnly } from '$lib/date'
	import AudioRecorder from '$lib/components/AudioRecorder.svelte'
	import SongSelect from '$lib/components/SongSelect.svelte'
	import { sortedWithSong } from '$lib/songs'
	import { clearTakes } from '$lib/recording-store'
	import { createSession, DuplicateError, sendAudioFile, splitUrl, type DuplicateInfo } from '$lib/upload-client'

	/**
	 * Enregistrer d'abord, classer ensuite : en répétition, on lance le micro sans
	 * remplir de formulaire. Session et morceau ne se demandent qu'une fois
	 * l'enregistrement terminé — la copie de secours couvre ce délai.
	 */
	let { data }: { data: PageData } = $props()

	type SessionRow = { id: number; date: string | Date; type: string; title: string | null; location: string | null }
	type SongRow = { id: number; title: string }

	const sessions = $derived(data.sessions as unknown as SessionRow[])
	// $derived inscriptible : un morceau créé depuis le sélecteur s'y ajoute sur place.
	let songs = $derived(data.songs as unknown as SongRow[])

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
	// Date le titre provisoire d'un morceau créé à la volée : c'est l'heure de la prise
	// qui aide à la reconnaître plus tard, pas celle du classement.
	let recordedAt = $state<Date | null>(null)
	let recording = $state(false)

	let selectedSession = $state('')
	let newDate = $state(localToday())
	let newType = $state('repetition')
	let newTitle = $state('')
	let newLocation = $state('')

	let multiTake = $state(false)
	let selectedSong = $state('')

	// Où va l'enregistrement. Le groupe d'abord — c'est la répétition qu'on capte le plus
	// souvent —, mais une idée jouée seul n'a rien à y faire tant qu'on ne l'a pas décidé :
	// l'espace perso l'accueille, et elle se classera en prise plus tard si elle le mérite.
	let destination = $state<'group' | 'perso'>(data.currentGroup ? 'group' : 'perso')
	let persoTitle = $state('')
	let persoNotes = $state('')

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
		recordedAt = new Date(Date.now() - durationS * 1000)
		if (!persoTitle.trim()) {
			persoTitle = `Enregistrement du ${recordedAt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`
		}
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

		if (destination === 'group') {
			if (!selectedSession) { error = 'Choisis une session.'; return }
			if (!multiTake && !selectedSong) { error = 'Choisis le morceau joué.'; return }
		}

		uploading = true
		try {
			const onProgress = (p: number) => (progress = p)

			// Rien à classer : l'enregistrement rejoint l'espace perso comme s'il avait été
			// déposé depuis /perso — même route, et même découpe s'il contient plusieurs idées.
			if (destination === 'perso' && multiTake) {
				const audioImport = await sendAudioFile<{ id: string }>(
					'/api/imports',
					file,
					{ destination: 'perso' },
					onProgress
				)
				await clearTakes().catch(() => {})
				await goto(splitUrl(audioImport.id, persoTitle))
				return
			}
			if (destination === 'perso') {
				const created = await sendAudioFile<{ id: number }>(
					'/api/personal',
					file,
					{ title: persoTitle.trim(), notes: persoNotes.trim() },
					onProgress
				)
				await clearTakes().catch(() => {})
				await goto(`/perso/${created.id}`)
				return
			}

			const sessionId = await resolveSessionId()

			if (multiTake) {
				const audioImport = await sendAudioFile<{ id: string }>(
					'/api/imports',
					file,
					{ session_id: String(sessionId) },
					onProgress
				)
				// Le serveur a le fichier : la copie de secours n'a plus lieu d'être.
				await clearTakes().catch(() => {})
				await goto(`/decoupe/${audioImport.id}`)
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

			<fieldset class="content-choice">
				<legend class="form-label">Destination</legend>
				<label class="check-label">
					<input type="radio" name="destination" value="group" bind:group={destination} disabled={uploading || !data.currentGroup} />
					<span>
						{data.currentGroup ? `Dans « ${data.currentGroup.name} »` : 'Dans le groupe'}
						<span class="hint block">Une prise de session, écoutable par tout le groupe.</span>
					</span>
				</label>
				<label class="check-label">
					<input type="radio" name="destination" value="perso" bind:group={destination} disabled={uploading} />
					<span>
						Dans mon espace perso
						<span class="hint block">
							Pour toi seul, sans session ni morceau à choisir. Se classe en prise plus tard.
						</span>
					</span>
				</label>
			</fieldset>

			{#snippet contentChoice()}
				<fieldset class="content-choice">
					<legend class="form-label">Contenu</legend>
					<label class="check-label">
						<input type="radio" name="content" value={true} bind:group={multiTake} disabled={uploading} />
						<span>
							À découper sur les blancs
							<span class="hint block">
								{destination === 'perso'
									? 'Les blancs sont repérés et chaque passage devient un enregistrement de ton espace perso.'
									: 'Les blancs sont repérés et chaque passage devient une prise.'}
							</span>
						</span>
					</label>
					<label class="check-label">
						<input type="radio" name="content" value={false} bind:group={multiTake} disabled={uploading} />
						<span>D'un seul tenant</span>
					</label>
				</fieldset>
			{/snippet}

			{#if destination === 'perso'}
				{@render contentChoice()}
				<!-- Découpé, le titre devient le titre commun des passages, numéroté sur
				     l'écran de découpe ; une note n'y a pas d'équivalent, elle se donne après. -->
				<label class="form-label">
					{multiTake ? 'Titre commun' : 'Titre'}
					{#if multiTake}<span class="hint">(numéroté par passage)</span>{/if}
					<input class="form-input" type="text" bind:value={persoTitle} maxlength={multiTake ? 180 : 200} disabled={uploading} />
				</label>
				{#if !multiTake}
					<label class="form-label">
						Note <span class="hint">(optionnel)</span>
						<textarea class="form-input" rows="2" bind:value={persoNotes} disabled={uploading}></textarea>
					</label>
				{/if}
			{:else}
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

			{@render contentChoice()}

			{#if !multiTake}
				<SongSelect
					{songs}
					bind:value={selectedSong}
					oncreate={(song) => (songs = sortedWithSong(songs, song))}
					label="Morceau"
					placeholderAt={recordedAt}
					required
					disabled={uploading}
				/>
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
				disabled={uploading ||
					(destination === 'group' && (!selectedSession || (!multiTake && !selectedSong)))}
			>
				{#if uploading}
					Envoi en cours…
				{:else if multiTake}
					Envoyer et découper
				{:else if destination === 'perso'}
					Ajouter à mon espace perso
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
