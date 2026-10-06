<script lang="ts">
	import type { PageData } from './$types'
	import { onDestroy } from 'svelte'
	import { afterNavigate, goto, invalidateAll } from '$app/navigation'
	import { backLinkFrom, type BackLink } from '$lib/back-link'
	import Icon from '$lib/components/Icon.svelte'
	import { formatDateOnly, localDateOnly, sessionOfDay } from '$lib/date'
	import AudioRecorder from '$lib/components/AudioRecorder.svelte'
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte'
	import SongSelect from '$lib/components/SongSelect.svelte'
	import UploadBatch from '$lib/components/UploadBatch.svelte'
	import LocationInput from '$lib/components/LocationInput.svelte'
	import type { Coords } from '$lib/places'
	import { SESSION_TYPES, sessionTypeLabel, type AudioTrim } from '$lib/types'
	import { sortedWithSong } from '$lib/songs'
	import { deleteTakes, takeIdOf, type RecordedTake } from '$lib/recording-store'
	import {
		batchItemSettled,
		createSession,
		DuplicateError,
		nameBatchItemsLater,
		sendAudioFile,
		sendBatchItems,
		splitUrl,
		trimFields,
		type BatchItem,
		type DuplicateInfo
	} from '$lib/upload-client'

	/**
	 * Enregistrer d'abord, classer ensuite : en répétition, on lance le micro sans
	 * remplir de formulaire. Session et morceau ne se demandent qu'une fois
	 * l'enregistrement terminé — la copie de secours couvre ce délai.
	 */
	let { data }: { data: PageData } = $props()

	let back = $state<BackLink>({ href: '/', label: 'Tableau de bord', fromHistory: false })
	afterNavigate(({ from }) => {
		back = backLinkFrom(from?.url, { href: '/', label: 'Tableau de bord' })
	})

	type SessionRow = { id: number; date: string | Date; type: string; title: string | null; location: string | null }
	type SongRow = { id: number; title: string }

	const sessions = $derived(data.sessions as unknown as SessionRow[])
	// $derived inscriptible : un morceau créé depuis le sélecteur s'y ajoute sur place.
	let songs = $derived(data.songs as unknown as SongRow[])

	// Au-delà, c'est une répétition captée d'un bloc plutôt qu'un morceau isolé.
	const SPLIT_BY_DEFAULT_ABOVE_S = 10 * 60

	let file = $state<File | null>(null)
	let audioTrim = $state<AudioTrim | null>(null)
	// Date le titre provisoire d'un morceau créé à la volée : c'est l'heure de la prise
	// qui aide à la reconnaître plus tard, pas celle du classement.
	let recordedAt = $state<Date | null>(null)
	let recording = $state(false)

	let selectedSession = $state('')
	let newDate = $state(localDateOnly())
	let newType = $state('repetition')
	let newTitle = $state('')
	let newLocation = $state('')
	let newCoords = $state<Coords | null>(null)

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
	 * Mode série : plusieurs prises enregistrées d'affilée, « Prise suivante » entre deux
	 * morceaux. Chacune attend ici son morceau, et tout part à la fin dans la même session,
	 * comme un envoi par lots de `/upload`. Dans le groupe seulement : une idée jouée seule
	 * va dans l'espace perso une à une, ou se découpe.
	 */
	let series = $state<BatchItem[]>([])
	// La prise affichée par l'enregistreur. Dès qu'une série existe, elle en fait partie :
	// on la classe avec les autres sans attendre d'enregistrer la suivante.
	let currentKey: number | null = null
	let recorderRef = $state<ReturnType<typeof AudioRecorder> | null>(null)
	let seriesSessionId = $state<number | null>(null)
	let seriesRun = $state({ done: 0, total: 0 })
	let naming = $state(false)
	let removing = $state<BatchItem | null>(null)

	const seriesPending = $derived(series.filter((item) => !batchItemSettled(item)))
	const seriesUnassigned = $derived(seriesPending.filter((item) => !item.songId).length)
	const seriesDone = $derived(series.filter((item) => item.status === 'done').length)
	const seriesDuplicates = $derived(series.filter((item) => item.status === 'duplicate').length)
	const seriesFailed = $derived(series.filter((item) => item.status === 'error').length)
	const seriesSent = $derived(seriesDone + seriesDuplicates + seriesFailed > 0)

	let destroyed = false
	onDestroy(() => {
		destroyed = true
		for (const item of series) if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
	})

	function timeLabel(file: File) {
		return new Date(file.lastModified).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
	}

	/**
	 * La prise suivante est le plus souvent le même morceau, rejoué : on le propose. La
	 * première d'une série garde le morceau déjà choisi dans le formulaire simple.
	 */
	function addToSeries(take: RecordedTake, songId?: string) {
		const previous = series.at(-1)?.songId ?? ''
		series.push({
			key: take.id,
			file: take.file,
			songId: songId ?? previous,
			proposedSong: songId === undefined ? previous : '',
			proposedFrom: 'previous',
			label: `Enregistrée à ${timeLabel(take.file)}`,
			durationS: take.durationS,
			trim: take.trim,
			previewUrl: URL.createObjectURL(take.file),
			status: 'pending',
			progress: 0
		})
	}

	function removeFromSeries(key: number) {
		const item = series.find((i) => i.key === key)
		if (!item || batchItemSettled(item)) return
		if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
		series = series.filter((i) => i.key !== key)
	}

	/** « Prise suivante » : l'enregistreur confie la prise terminée, et repart aussitôt. */
	function keepTake(take: RecordedTake) {
		const existing = series.find((item) => item.key === take.id)
		if (existing) {
			existing.trim = take.trim
			existing.durationS = take.durationS
		} else {
			// Une série récupérée après un plantage n'est pas passée par le formulaire
			// simple : sa session se propose comme pour une prise seule.
			if (!series.length && !selectedSession) proposeSession(new Date(take.file.lastModified))
			addToSeries(take, series.length ? undefined : selectedSong)
		}
		currentKey = null
	}

	function onTrimChange(trim: AudioTrim | null) {
		audioTrim = trim
		const item = currentKey === null ? undefined : series.find((i) => i.key === currentKey)
		if (item && !batchItemSettled(item)) item.trim = trim
	}

	/**
	 * Retirer la prise affichée par l'enregistreur passe par son « Recommencer » ; une
	 * autre n'existe plus que dans ce navigateur, d'où la confirmation.
	 */
	function requestRemove(key: number) {
		if (key === currentKey) { recorderRef?.requestDiscard(); return }
		const item = series.find((i) => i.key === key)
		if (item) removing = item
	}

	function confirmRemove() {
		if (!removing) return
		const key = removing.key
		removing = null
		removeFromSeries(key)
		deleteTakes([key]).catch(() => {})
	}

	async function nameSeriesLater() {
		if (naming) return
		naming = true
		error = null
		try {
			error = await nameBatchItemsLater(
				seriesPending,
				songs.map((s) => s.title),
				(song) => (songs = sortedWithSong(songs, song))
			)
		} finally {
			naming = false
		}
	}

	async function submitSeries(e: SubmitEvent) {
		e.preventDefault()
		if (uploading || recording) return
		error = null
		if (!selectedSession) { error = 'Choisis une session.'; return }
		if (seriesUnassigned > 0) { error = 'Chaque prise doit être rattachée à un morceau.'; return }

		uploading = true
		let sessionId = seriesSessionId
		try {
			sessionId ??= await resolveSessionId()
			seriesSessionId = sessionId
			const queue = [...seriesPending]
			seriesRun = { done: 0, total: queue.length }
			await sendBatchItems(queue, sessionId, (item) => {
				seriesRun.done++
				// Le serveur a la prise : sa copie de secours n'a plus lieu d'être.
				if (batchItemSettled(item)) deleteTakes([item.key]).catch(() => {})
			})
		} catch (err) {
			error = err instanceof Error ? err.message : 'Erreur inattendue.'
		} finally {
			uploading = false
		}

		// Tout est passé : la session montre les prises rangées par morceau. Sinon on reste,
		// pour lire ce qui a échoué ou existait déjà.
		if (!destroyed && sessionId && series.every((item) => item.status === 'done')) {
			await goto(`/sessions/${sessionId}`)
		}
	}

	/**
	 * À chaque enregistrement terminé, on propose le classement le plus probable :
	 * la session du jour de l'enregistrement si elle existe (sinon une nouvelle, datée
	 * de ce jour), et
	 * la découpe dès que l'enregistrement est long.
	 */
	function onRecorded(recorded: File | null, durationS: number) {
		file = recorded
		audioTrim = null
		duplicate = null
		if (!recorded) {
			// Prise jetée (« Recommencer ») : elle quitte aussi la série. Confiée par
			// « Prise suivante », `currentKey` est déjà retombé et rien ne part.
			if (currentKey !== null) removeFromSeries(currentKey)
			currentKey = null
			return
		}
		error = null
		currentKey = takeIdOf(recorded)
		// L'enregistreur date le fichier du début de la captation, copie de secours
		// reprise plus tard comprise.
		recordedAt = new Date(recorded.lastModified)
		if (series.length) {
			// La session de la série est déjà choisie : la prise la rejoint.
			addToSeries({ id: currentKey, file: recorded, durationS, trim: null })
			return
		}
		if (!persoTitle.trim()) {
			persoTitle = `Enregistrement du ${recordedAt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`
		}
		proposeSession(recordedAt)
		multiTake = durationS >= SPLIT_BY_DEFAULT_ABOVE_S
	}

	function proposeSession(at: Date) {
		const daySession = sessionOfDay(sessions, at)
		selectedSession = daySession ? String(daySession.id) : 'new'
		newDate = localDateOnly(at)
	}

	function sessionLabel(s: SessionRow): string {
		const date = formatDateOnly(s.date, { day: '2-digit', month: 'short', year: 'numeric' })
		const detail = s.title || s.location || sessionTypeLabel(s.type)
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
			location: newLocation.trim() || undefined,
			location_coords: newLocation.trim() ? newCoords : null
		})
		// La session existe désormais : un nouvel essai (doublon, réseau) ne doit pas
		// en créer une seconde.
		await invalidateAll()
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
		const sentTake = takeIdOf(file)
		try {
			const onProgress = (p: number) => (progress = p)

			// Rien à classer : l'enregistrement rejoint l'espace perso comme s'il avait été
			// déposé depuis /perso — même route, et même découpe s'il contient plusieurs idées.
			if (destination === 'perso' && multiTake) {
				const audioImport = await sendAudioFile<{ id: string }>(
					'/api/imports',
					file,
					{ destination: 'perso', ...trimFields(audioTrim) },
					onProgress
				)
				await deleteTakes([sentTake]).catch(() => {})
				await goto(splitUrl(audioImport.id, persoTitle))
				return
			}
			if (destination === 'perso') {
				const created = await sendAudioFile<{ id: number }>(
					'/api/personal',
					file,
					{ title: persoTitle.trim(), notes: persoNotes.trim(), ...trimFields(audioTrim) },
					onProgress
				)
				await deleteTakes([sentTake]).catch(() => {})
				await goto(`/perso/${created.id}`)
				return
			}

			const sessionId = await resolveSessionId()

			if (multiTake) {
				const audioImport = await sendAudioFile<{ id: string }>(
					'/api/imports',
					file,
					{ session_id: String(sessionId), ...trimFields(audioTrim) },
					onProgress
				)
				// Le serveur a le fichier : la copie de secours n'a plus lieu d'être.
				await deleteTakes([sentTake]).catch(() => {})
				await goto(`/decoupe/${audioImport.id}`)
				return
			}

			const result = await sendAudioFile<{ id: number }>(
				'/api/upload',
				file,
				{ session_id: String(sessionId), song_id: selectedSong, ...trimFields(audioTrim) },
				onProgress
			)
			await deleteTakes([sentTake]).catch(() => {})
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

<main class="page page-narrow">
	<nav class="breadcrumb">
		<a href={back.href} onclick={(e) => { if (back.fromHistory) { e.preventDefault(); history.back() } }}>{back.label}</a> /
		<span>Enregistrer</span>
	</nav>
	<div class="page-header">
		<h1>Enregistrer</h1>
	</div>

	<a href="/upload" class="upload-link">
		<Icon name="upload" /> Un fichier déjà prêt ? <strong>Envoyer un fichier</strong>
	</a>

	<section class="panel">
		<AudioRecorder
			bind:this={recorderRef}
			disabled={uploading}
			onchange={onRecorded}
			ontrimchange={onTrimChange}
			onbusychange={(busy) => (recording = busy)}
			onkeep={data.currentGroup ? keepTake : undefined}
		/>
	</section>

	{#snippet sessionFields(locked: boolean)}
		<label class="form-label">
			Session
			<select class="form-input" bind:value={selectedSession} disabled={uploading || locked} required>
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
						{#each SESSION_TYPES as value}
							<option {value}>{sessionTypeLabel(value)}</option>
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
				<div class="wide">
					<LocationInput bind:value={newLocation} bind:coords={newCoords} optional disabled={uploading} />
				</div>
			</div>
		{/if}
	{/snippet}

	{#if series.length}
		<!-- Visible pendant l'enregistrement de la suivante : on nomme les prises entre deux morceaux. -->
		<form onsubmit={submitSeries}>
			<h2>Série — {series.length} prise{series.length > 1 ? 's' : ''}</h2>
			<p class="hint">
				Chaque prise devient une prise de la session dans « {data.currentGroup?.name} », avec son
				propre morceau. Rien ne part avant « Envoyer ».
			</p>

			{#if error}
				<p class="message-error">{error}</p>
			{/if}

			<!-- Des prises de la série y sont déjà : les suivantes les rejoignent. -->
			{@render sessionFields(seriesDone > 0)}

			<UploadBatch
				bind:items={series}
				{songs}
				oncreate={(song) => (songs = sortedWithSong(songs, song))}
				onremove={requestRemove}
				disabled={uploading || naming}
			/>

			{#if seriesUnassigned > 0}
				<div class="series-unassigned">
					<p class="hint">
						{seriesUnassigned} prise{seriesUnassigned > 1 ? 's' : ''} sans morceau — choisis-le, ou nomme plus tard.
					</p>
					<button type="button" class="btn btn-secondary btn-sm" onclick={nameSeriesLater} disabled={naming || uploading}>
						{naming ? 'Création…' : 'Nommer plus tard'}
					</button>
				</div>
			{/if}

			{#if seriesSent && !uploading}
				<p class="hint" role="status">
					{[
						seriesDone ? `${seriesDone} prise${seriesDone > 1 ? 's' : ''} ajoutée${seriesDone > 1 ? 's' : ''}` : null,
						seriesDuplicates ? `${seriesDuplicates} déjà présente${seriesDuplicates > 1 ? 's' : ''}` : null,
						seriesFailed ? `${seriesFailed} en échec` : null
					].filter(Boolean).join(' · ')}.
					{#if seriesSessionId && seriesDone > 0}<a href="/sessions/{seriesSessionId}">Voir la session →</a>{/if}
				</p>
			{/if}

			{#if seriesPending.length}
				{#if recording}
					<p class="hint">Termine la prise en cours pour envoyer la série.</p>
				{/if}
				<button
					type="submit"
					class="btn btn-primary btn-lg submit-btn"
					disabled={uploading || naming || recording || !selectedSession || seriesUnassigned > 0}
				>
					{#if uploading}
						Envoi {Math.min(seriesRun.done + 1, seriesRun.total)} / {seriesRun.total}…
					{:else if seriesFailed > 0}
						Réessayer {seriesPending.length} prise{seriesPending.length > 1 ? 's' : ''}
					{:else}
						Envoyer {seriesPending.length} prise{seriesPending.length > 1 ? 's' : ''}
					{/if}
				</button>
			{:else if seriesSessionId}
				<a class="btn btn-primary btn-lg submit-btn" href="/sessions/{seriesSessionId}">Voir la session</a>
			{/if}
		</form>
	{:else if file && !recording}
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
			{@render sessionFields(false)}

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
				class="btn btn-primary btn-lg submit-btn"
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

<!-- Un onglet fermé coupe l'envoi en cours ; une navigation dans l'application, non. -->
<svelte:window onbeforeunload={(e) => { if (uploading) e.preventDefault() }} />

<!-- Une prise de la série n'existe encore que dans ce navigateur. -->
<ConfirmDialog
	open={removing !== null}
	level="warning"
	title="Retirer cette prise ?"
	message={removing
		? `La prise ${removing.label?.toLocaleLowerCase('fr') ?? ''} sera perdue : elle n'a pas encore été envoyée.`
		: ''}
	confirmLabel="Retirer la prise"
	cancelLabel="Garder"
	onConfirm={confirmRemove}
	onCancel={() => (removing = null)}
/>

<style>

	h1 { font-size: var(--text-xl); margin: 0; }

	h2 {
		font-size: var(--text-sm);
		font-weight: 700;
		text-transform: uppercase;
		color: var(--color-text-secondary);
		margin: 0;
	}

	.upload-link {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		margin: -0.75rem 0 1.25rem;
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		text-decoration: none;
	}

	.upload-link strong { color: var(--color-accent); }
	.upload-link:hover strong { text-decoration: underline; }

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
		font-size: var(--text-xs);
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

	.submit-btn { align-self: flex-start; }

	.series-unassigned {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
</style>
