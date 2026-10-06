<script lang="ts">
	import { SESSION_TYPES, sessionTypeLabel } from '$lib/types'
	import type { PageData } from './$types'
	import { onDestroy } from 'svelte'
	import { afterNavigate, goto, invalidateAll } from '$app/navigation'
	import { backLinkFrom, type BackLink } from '$lib/back-link'
	import { formatDateOnly, localDateOnly, sessionOfDay } from '$lib/date'
	import SongDetails from '$lib/components/SongDetails.svelte'
	import LocationInput from '$lib/components/LocationInput.svelte'
	import type { Coords } from '$lib/places'
	import YouTubePlayer from '$lib/components/YouTubePlayer.svelte'
	import Icon from '$lib/components/Icon.svelte'
	import SongSelect from '$lib/components/SongSelect.svelte'
	import PendingImports from '$lib/components/PendingImports.svelte'
	import UploadBatch from '$lib/components/UploadBatch.svelte'
	import { createSong, placeholderSongTitle, sortedWithSong } from '$lib/songs'
	import { songFromFileName } from '$lib/song-match'
	import { parseYouTubeVideoId } from '$lib/youtube'
	import {
		batchItemSettled,
		createSession,
		DuplicateError,
		sendAudioFile,
		type BatchItem,
		type DuplicateInfo
	} from '$lib/upload-client'

	let { data }: { data: PageData } = $props()

	// `audio/*` est mal interprété par certains sélecteurs de fichiers iOS et peut
	// rendre les M4A inaccessibles. Les extensions explicites évitent ce filtre
	// défaillant, tandis que les MIME couvrent les autres navigateurs.
	const acceptedAudioFiles =
		'.mp3,.wav,.flac,.aac,.m4a,.ogg,.oga,.opus,.webm,audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/flac,audio/x-flac,audio/aac,audio/mp4,audio/m4a,audio/x-m4a,audio/ogg,audio/opus,audio/webm,video/webm'

	type SessionRow = { id: number; date: string; location: string | null }
	type SongRow = { id: number; title: string; lyrics: string | null; music_notes: string | null }

	const sessions = $derived(data.sessions as unknown as SessionRow[])
	// $derived inscriptible : un morceau créé depuis le sélecteur s'y ajoute sur place.
	let songs = $derived(data.songs as unknown as SongRow[])
	const selectedSongData = $derived(songs.find((song) => String(song.id) === selectedSong) ?? null)
	const requestedSessionId = $derived(data.selectedSessionId)
	const requestedSongId = $derived(data.selectedSongId)

	// Venu d'ailleurs dans l'application, on y revient ; ouvert directement avec une
	// session choisie, on rejoint cette session.
	let back = $state<BackLink>({ href: '/', label: 'Tableau de bord', fromHistory: false })
	afterNavigate(({ from }) => {
		back = backLinkFrom(
			from?.url,
			requestedSessionId
				? { href: `/sessions/${requestedSessionId}`, label: 'Session' }
				: { href: '/', label: 'Tableau de bord' }
		)
	})

	// L'identifiant est validé dans le load serveur. On le garde aussi synchronisé
	// lorsqu'une navigation client change seulement la query string de /upload.
	function initialSelectedSession() {
		return requestedSessionId
	}

	let selectedSession = $state<string>(initialSelectedSession())
	let selectedSessionContext = $state(initialSelectedSession())
	function initialSelectedSong() {
		return requestedSongId
	}

	let selectedSong = $state<string>(initialSelectedSong())
	let selectedSongContext = $state(initialSelectedSong())
	$effect(() => {
		if (requestedSessionId !== selectedSessionContext) {
			selectedSession = requestedSessionId
			selectedSessionContext = requestedSessionId
		}
		if (requestedSongId !== selectedSongContext) {
			selectedSong = requestedSongId
			selectedSongContext = requestedSongId
		}
	})
	let newDate = $state('')
	let newType = $state('repetition')
	let newTitle = $state('')
	let newLocation = $state('')
	let newCoords = $state<Coords | null>(null)
	let file = $state<File | null>(null)

	// Une répétition enregistrée d'un bloc contient plusieurs morceaux : le fichier part
	// alors en zone de transit, et c'est l'écran de découpe qui en tire les prises.
	// Le morceau ne se choisit donc pas ici, mais segment par segment.
	let multiTake = $state(false)

	// Une prise peut aussi être une vidéo YouTube (un live en ligne) : une vidéo, un morceau.
	// Rien n'est envoyé ni converti, seul l'identifiant de la vidéo est enregistré.
	let source = $state<'audio' | 'youtube'>('audio')
	let videoUrl = $state('')
	const videoId = $derived(parseYouTubeVideoId(videoUrl))
	// Remontée par le lecteur d'aperçu : YouTube ne la donne pas au serveur sans clé d'API.
	let videoDurationS = $state(0)

	// Plusieurs fichiers choisis d'un coup : chacun devient une prise de la session, avec
	// son propre morceau. Une répétition enregistrée morceau par morceau au téléphone se
	// verse ainsi en une fois, au lieu d'un aller-retour par fichier.
	let batch = $state<BatchItem[]>([])
	let nextBatchKey = 0
	const isBatch = $derived(source === 'audio' && batch.length > 0)
	const batchPending = $derived(batch.filter((item) => !batchItemSettled(item)))
	const batchUnassigned = $derived(batchPending.filter((item) => !item.songId).length)
	const batchFailed = $derived(batch.filter((item) => item.status === 'error').length)
	const batchDone = $derived(batch.filter((item) => item.status === 'done').length)
	const batchDuplicates = $derived(batch.filter((item) => item.status === 'duplicate').length)
	const batchSent = $derived(batch.some(batchItemSettled) || batchFailed > 0)
	// Session de la série : celle des prises déjà créées, pour que les suivantes et les
	// nouveaux essais les y rejoignent.
	let batchSessionId = $state<number | null>(null)
	let batchRun = $state({ done: 0, total: 0 })
	// La page quittée pendant l'envoi, les fichiers restants partent quand même : seule la
	// redirection finale n'a plus lieu d'être.
	let destroyed = false
	onDestroy(() => (destroyed = true))

	const isSplit = $derived(source === 'audio' && multiTake && !isBatch)
	const sourceReady = $derived(source === 'audio' ? !!file || batchPending.length > 0 : !!videoId)

	let uploading = $state(false)
	let progress = $state(0)
	let error = $state<string | null>(null)
	let duplicate = $state<DuplicateInfo | null>(null)

	// Session proposée d'après la date du fichier : tant qu'on n'y a pas touché, un autre
	// fichier peut la remplacer ; un choix fait à la main, lui, ne se défait pas.
	let proposedSession = ''
	// Même règle pour le morceau, deviné d'après le nom du fichier.
	let proposedSong = $state('')

	/**
	 * Un fichier enregistré le jour d'une session en est presque toujours une prise :
	 * la date du fichier (celle de l'enregistrement sur un téléphone) désigne la session.
	 * Son nom, quand on l'a renommé, désigne souvent le morceau.
	 */
	function pickFile(input: HTMLInputElement) {
		const picked = Array.from(input.files ?? [])
		if (picked.length > 1) { pickBatch(picked); return }
		batch = []
		batchSessionId = null
		file = picked[0] ?? null
		if (!file) return
		proposeSession(new Date(file.lastModified))
		if (selectedSong === '' || selectedSong === proposedSong) {
			const named = songFromFileName(file.name, songs)
			selectedSong = proposedSong = named ? String(named.id) : ''
		}
	}

	function proposeSession(recordedAt: Date) {
		if (!newDate) newDate = localDateOnly(recordedAt)
		if (selectedSession === '' || selectedSession === proposedSession) {
			const daySession = sessionOfDay(sessions, recordedAt)
			selectedSession = proposedSession = daySession ? String(daySession.id) : ''
		}
	}

	/**
	 * Une nouvelle sélection remplace la précédente, comme le champ fichier lui-même.
	 * Rangés par date d'enregistrement : deux fichiers du même morceau se numérotent
	 * dans l'ordre où ils ont été joués, pas dans celui du sélecteur de fichiers.
	 */
	function pickBatch(picked: File[]) {
		file = null
		batchSessionId = null
		const ordered = [...picked].sort((a, b) => a.lastModified - b.lastModified)
		batch = ordered.map((f) => {
			const named = songFromFileName(f.name, songs)
			const songId = named ? String(named.id) : ''
			return { key: nextBatchKey++, file: f, songId, proposedSong: songId, status: 'pending', progress: 0 }
		})
		// Le premier fichier date le début de la répétition.
		proposeSession(new Date(ordered[0].lastModified))
	}

	/** Revenu à un seul fichier avant tout envoi, on retrouve le formulaire simple. */
	function removeBatchItem(key: number) {
		batch = batch.filter((item) => item.key !== key)
		if (batch.length === 1 && !batchSent) {
			const [last] = batch
			file = last.file
			selectedSong = last.songId
			proposedSong = last.proposedSong
			batch = []
		}
	}

	/**
	 * Comme « Nommer plus tard » de la découpe : chaque fichier sans morceau reçoit le sien,
	 * « À nommer — … » à l'heure du fichier. Un par fichier, pas un pour tous : regrouper
	 * à tort serait plus pénible à défaire que renommer.
	 */
	let naming = $state(false)
	async function nameBatchLater() {
		if (naming) return
		naming = true
		error = null
		try {
			for (const item of batchPending) {
				if (item.songId) continue
				const result = await createSong(
					placeholderSongTitle(new Date(item.file.lastModified), songs.map((s) => s.title))
				)
				if (!result.ok) { error = result.error; return }
				songs = sortedWithSong(songs, result.song)
				item.songId = String(result.song.id)
			}
		} finally {
			naming = false
		}
	}

	/**
	 * Un fichier après l'autre : la conversion est la partie coûteuse, et le serveur n'en
	 * gagnerait rien à en mener plusieurs de front. Un échec n'arrête pas la série, il se
	 * réessaie ensuite seul ; un doublon est simplement signalé.
	 */
	async function submitBatch() {
		if (batchUnassigned > 0) { error = 'Chaque fichier doit être rattaché à un morceau.'; return }

		uploading = true
		let sessionId: number | null = batchSessionId
		try {
			sessionId ??= await resolveSessionId()
			if (sessionId === null) return
			batchSessionId = sessionId

			const queue = [...batchPending]
			batchRun = { done: 0, total: queue.length }
			for (const item of queue) {
				item.status = 'sending'
				item.progress = 0
				item.error = undefined
				try {
					const created = await sendAudioFile<{ id: number; take: number }>(
						'/api/upload',
						item.file,
						{ session_id: String(sessionId), song_id: item.songId },
						(p) => {
							item.progress = p
							if (p >= 100) item.status = 'converting'
						}
					)
					item.recording = { id: created.id, take: created.take }
					item.status = 'done'
				} catch (err) {
					if (err instanceof DuplicateError) {
						item.duplicate = err.duplicate
						item.status = 'duplicate'
					} else {
						item.error = err instanceof Error ? err.message : 'Erreur inattendue.'
						item.status = 'error'
					}
				}
				batchRun.done++
			}
		} finally {
			uploading = false
		}

		// Tout est passé : la session montre les prises rangées par morceau. Sinon on reste,
		// pour lire ce qui a échoué ou existait déjà.
		if (!destroyed && batch.every((item) => item.status === 'done')) await goto(`/sessions/${sessionId}`)
	}

	function formatDate(d: string | Date) {
		return formatDateOnly(d, {
			day: '2-digit',
			month: 'short',
			year: 'numeric'
		})
	}

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault()
		if (uploading) return
		error = null
		duplicate = null
		progress = 0

		if (isBatch) { await submitBatch(); return }

		if (!isSplit && !selectedSong) { error = 'Sélectionne un morceau.'; return }
		if (source === 'audio' && !file) { error = 'Sélectionne un fichier audio.'; return }
		if (source === 'youtube' && !videoId) { error = 'Colle un lien YouTube valide.'; return }

		uploading = true

		try {
			const sessionId = await resolveSessionId()
			if (sessionId === null) return

			if (source === 'youtube') {
				// Avec sa piste audio, la vidéo suit le chemin d'un upload normal (conversion,
				// doublon, waveform) ; seule, elle ne transporte aucun fichier.
				const result = file
					? await sendFile<{ id: number }>('/api/upload', sessionId, selectedSong, { youtube_url: videoId ?? '' })
					: await addYouTubeVideo(sessionId)
				await goto(`/recording/${result.id}`)
				return
			}

			if (multiTake) {
				const audioImport = await sendFile<{ id: string }>('/api/imports', sessionId)
				await goto(`/decoupe/${audioImport.id}`)
				return
			}

			const result = await sendFile<{ id: number }>('/api/upload', sessionId, selectedSong)
			// Juste après l'ajout, c'est le moment de commenter la prise : on ouvre le lecteur.
			await goto(`/recording/${result.id}`)
		} catch (err) {
			if (err instanceof DuplicateError) {
				duplicate = err.duplicate
			} else {
				error = err instanceof Error ? err.message : 'Erreur inattendue.'
			}
		} finally {
			uploading = false
		}
	}

	/** Session existante, ou création à la volée. `null` = l'erreur est déjà affichée. */
	async function resolveSessionId(): Promise<number | null> {
		if (selectedSession !== 'new') {
			const sessionId = parseInt(selectedSession)
			if (isNaN(sessionId)) { error = 'Session invalide.'; return null }
			return sessionId
		}

		if (!newDate) { error = 'Saisis la date de la session.'; return null }

		try {
			const sessionId = await createSession({
				date: newDate,
				type: newType,
				title: newTitle.trim() || undefined,
				location: newLocation.trim() || undefined,
				location_coords: newLocation.trim() ? newCoords : null
			})
			// La session existe désormais : un nouvel essai après un échec doit la reprendre,
			// pas en créer une seconde.
			await invalidateAll()
			selectedSession = String(sessionId)
			return sessionId
		} catch (err) {
			error = err instanceof Error ? err.message : 'Erreur création session.'
			return null
		}
	}

	async function addYouTubeVideo(sessionId: number): Promise<{ id: number }> {
		const res = await fetch('/api/youtube', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				session_id: sessionId,
				song_id: parseInt(selectedSong),
				video_url: videoId,
				duration_s: videoDurationS || null
			})
		})
		const json = await res.json().catch(() => ({}))
		if (res.status === 409 && json.duplicate) throw new DuplicateError(json.duplicate)
		if (!res.ok) throw new Error(json.error ?? `Erreur ${res.status}`)
		return json
	}

	function sendFile<T>(
		url: string,
		sessionId: number,
		songId?: string,
		extraFields: Record<string, string> = {}
	): Promise<T> {
		const fields: Record<string, string> = { session_id: String(sessionId), ...extraFields }
		if (songId) fields.song_id = songId
		return sendAudioFile<T>(url, file as File, fields, (p) => (progress = p))
	}
</script>

<svelte:head>
	<title>Uploader une prise</title>
</svelte:head>

<!-- Un onglet fermé coupe l'envoi en cours ; une navigation dans l'application, non. -->
<svelte:window onbeforeunload={(e) => { if (uploading) e.preventDefault() }} />

<main class="page page-narrow">
	<nav class="breadcrumb">
		<a href={back.href} onclick={(e) => { if (back.fromHistory) { e.preventDefault(); history.back() } }}>{back.label}</a> /
		<span>Uploader une prise</span>
	</nav>
	<div class="page-header">
		<h1>Uploader une prise</h1>
	</div>

	<a href="/record" class="record-link">
		<Icon name="mic" /> Pas encore de fichier ? <strong>Enregistrer maintenant</strong>
	</a>

	{#if duplicate}
		<div class="message-error" style="margin-bottom: 0.75rem;">
			{source === 'youtube'
				? (file ? 'Ce fichier ou cette vidéo existe déjà' : 'Cette vidéo a déjà été ajoutée')
				: 'Ce fichier a déjà été uploadé'} : <strong>{duplicate.song_title}</strong>,
			prise #{duplicate.take} ({formatDate(duplicate.session_date)}).
			<a href="/recording/{duplicate.id}">Voir la prise →</a>
		</div>
	{/if}

	{#if error}
		<p class="message-error" style="margin-bottom: 0.75rem;">{error}</p>
	{/if}

	<form onsubmit={handleSubmit}>
		<!-- Session -->
		<fieldset>
			<legend>Session</legend>
			<label class="form-label">
				Sélectionner une session
				<!-- Des prises de la série y sont déjà : les suivantes les rejoignent. -->
				<select class="form-input" bind:value={selectedSession} required disabled={uploading || batchDone > 0}>
					<option value="" disabled>— Choisir —</option>
					<option value="new">+ Nouvelle session</option>
					{#each sessions as s}
						<option value={String(s.id)}>
							{formatDate(s.date)}{s.location ? ` — ${s.location}` : ''}
						</option>
					{/each}
				</select>
			</label>

			{#if selectedSession === 'new'}
				<div class="new-session-fields">
					<label class="form-label">
						Type
						<select class="form-input" bind:value={newType} disabled={uploading}>
							{#each SESSION_TYPES as value}
								<option {value}>{sessionTypeLabel(value)}</option>
							{/each}
						</select>
					</label>
					<label class="form-label">
						Date <span class="required">*</span>
						<input class="form-input" type="date" bind:value={newDate} required disabled={uploading} />
					</label>
					<label class="form-label" style="grid-column: 1 / -1">
						Titre <span class="hint">(optionnel)</span>
						<input class="form-input" type="text" bind:value={newTitle} placeholder="ex : Répète avant Ducasse" disabled={uploading} />
					</label>
					<LocationInput bind:value={newLocation} bind:coords={newCoords} disabled={uploading} />
				</div>
			{/if}
		</fieldset>

		<!-- Morceau — en mode découpe, il se choisit segment par segment -->
		<fieldset>
			<legend>Morceau</legend>
			{#if isSplit}
				<p class="hint">
					Chaque segment détecté recevra son propre morceau à l'écran suivant.
				</p>
			{:else if isBatch}
				<p class="hint">
					Chaque fichier reçoit son propre morceau, dans la liste des fichiers ci-dessous.
				</p>
			{:else}
				<SongSelect
					{songs}
					bind:value={selectedSong}
					oncreate={(song) => (songs = sortedWithSong(songs, song))}
					label="Sélectionner un morceau"
					placeholderAt={file ? new Date(file.lastModified) : null}
					required
					disabled={uploading}
				/>
				{#if file && proposedSong !== '' && selectedSong === proposedSong}
					<p class="hint">Proposé d'après le nom du fichier.</p>
				{/if}
				{#if selectedSongData}
					<SongDetails
						lyrics={selectedSongData.lyrics}
						musicNotes={selectedSongData.music_notes}
						compact
					/>
				{/if}
			{/if}
		</fieldset>

		<!-- Source : fichier audio ou vidéo YouTube -->
		<fieldset>
			<legend>Source</legend>
			<div class="source-choice" role="radiogroup" aria-label="Source de la prise">
				<label class="check-label">
					<input type="radio" name="source" value="audio" bind:group={source} disabled={uploading} />
					<span>Fichier audio</span>
				</label>
				<label class="check-label">
					<input type="radio" name="source" value="youtube" bind:group={source} disabled={uploading} />
					<span>Vidéo YouTube</span>
				</label>
			</div>

			{#if source === 'youtube'}
			<label class="form-label">
				Lien de la vidéo
				<input
					class="form-input"
					type="text"
					inputmode="url"
					placeholder="https://www.youtube.com/watch?v=…"
					bind:value={videoUrl}
					disabled={uploading}
				/>
			</label>
			{#if videoUrl.trim() && !videoId}
				<p class="message-error">Lien YouTube non reconnu.</p>
			{/if}
			<p class="hint">
				Une vidéo = un morceau. Rien n'est téléchargé : la vidéo reste sur YouTube et doit être
				publique ou non répertoriée.
			</p>
			{#if videoId}
				<!-- Aperçu : vérifier que c'est la bonne vidéo, et récupérer sa durée. -->
				{#key videoId}
					<YouTubePlayer
						{videoId}
						onStateChange={(state) => {
							if (state.duration) videoDurationS = state.duration
						}}
					/>
				{/key}
			{/if}

			<label class="form-label audio-track">
				<span>Piste audio <span class="hint">(facultatif)</span></span>
				<input
					type="file"
					accept={acceptedAudioFiles}
					disabled={uploading}
					onchange={(e) => pickFile(e.currentTarget as HTMLInputElement)}
				/>
			</label>
			{#if file}
				<p class="hint">
					{file.name} — {(file.size / 1024 / 1024).toFixed(1)} Mo
					<button type="button" class="btn-link btn-link-muted link-remove" onclick={() => (file = null)} disabled={uploading}>Retirer</button>
				</p>
			{/if}
			<p class="hint">
				Le son de la même vidéo, en fichier : la prise se lit alors aussi dans le lecteur audio
				et peut entrer dans une playlist. Sans lui, la vidéo se regarde seulement sur sa page.
			</p>
			{:else}
			<label class="form-label">
				Fichier (mp3, wav, m4a, ogg… — max 200 Mo)
				<input
					type="file"
					accept={acceptedAudioFiles}
					multiple={!multiTake}
					disabled={uploading}
					onchange={(e) => pickFile(e.currentTarget as HTMLInputElement)}
				/>
			</label>
			{#if file}
				<p class="hint">{file.name} — {(file.size / 1024 / 1024).toFixed(1)} Mo</p>
			{:else if !isBatch && !multiTake}
				<p class="hint">Plusieurs fichiers d'un coup : chacun devient une prise de la session.</p>
			{/if}

			{#if isBatch}
				<UploadBatch
					bind:items={batch}
					{songs}
					oncreate={(song) => (songs = sortedWithSong(songs, song))}
					onremove={removeBatchItem}
					disabled={uploading || naming}
				/>
				{#if batchUnassigned > 0}
					<div class="batch-unassigned">
						<p class="hint">
							{batchUnassigned} fichier{batchUnassigned > 1 ? 's' : ''} sans morceau — choisis-le ou retire le fichier.
						</p>
						<button type="button" class="btn btn-secondary btn-sm" onclick={nameBatchLater} disabled={naming || uploading}>
							{naming ? 'Création…' : 'Nommer plus tard'}
						</button>
					</div>
				{/if}
			{:else}
			<label class="check-label">
				<input type="checkbox" bind:checked={multiTake} disabled={uploading} />
				<span>
					À découper sur les blancs
					<span class="hint block">
						La répétition a été enregistrée d'un bloc : les blancs sont repérés
						automatiquement et chaque passage devient une prise à part.
					</span>
				</span>
			</label>
			{/if}
			{/if}
		</fieldset>

		<!-- Progression -->
		{#if uploading && file}
			<div class="progress-bar">
				<div class="progress-bar-fill" style="width: {progress}%"></div>
			</div>
			<p class="hint center">
				{#if progress < 100}
					Envoi en cours… {progress}%
				{:else if isSplit}
					Préparation du fichier… (l'analyse des blancs suit)
				{:else}
					Conversion audio en cours…
				{/if}
			</p>
		{/if}

		{#if isBatch && batchSent && !uploading}
			<p class="batch-summary" role="status">
				{[
					batchDone ? `${batchDone} prise${batchDone > 1 ? 's' : ''} ajoutée${batchDone > 1 ? 's' : ''}` : null,
					batchDuplicates ? `${batchDuplicates} déjà présente${batchDuplicates > 1 ? 's' : ''}` : null,
					batchFailed ? `${batchFailed} en échec` : null
				].filter(Boolean).join(' · ')}.
				{#if batchSessionId && batchDone > 0}<a href="/sessions/{batchSessionId}">Voir la session →</a>{/if}
			</p>
		{/if}

		{#if isBatch && batchPending.length === 0}
			{#if batchSessionId}
				<a class="btn btn-primary btn-lg submit-btn" href="/sessions/{batchSessionId}">Voir la session</a>
			{/if}
		{:else if isBatch}
			<button
				type="submit"
				class="btn btn-primary btn-lg submit-btn"
				disabled={uploading || naming || !selectedSession || batchUnassigned > 0}
			>
				{#if uploading}
					Envoi {batchRun.done + 1} / {batchRun.total}…
				{:else if batchFailed > 0}
					Réessayer {batchPending.length} fichier{batchPending.length > 1 ? 's' : ''}
				{:else}
					Uploader {batchPending.length} fichier{batchPending.length > 1 ? 's' : ''}
				{/if}
			</button>
		{:else}
		<button
			type="submit"
			class="btn btn-primary btn-lg submit-btn"
			disabled={uploading || !sourceReady || !selectedSession || (!isSplit && !selectedSong)}
		>
			{#if uploading}
				{source === 'youtube' ? 'Ajout en cours…' : 'Upload en cours…'}
			{:else if source === 'youtube'}
				Ajouter la vidéo
			{:else if multiTake}
				Analyser et découper
			{:else}
				Uploader
			{/if}
		</button>
		{/if}
	</form>

	<!-- Fichiers longs encore conservés : reprendre une découpe sans renvoyer l'original -->
	<PendingImports imports={data.imports} disabled={uploading} />
</main>

<style>

	h1 {
		font-size: var(--text-xl);
		margin: 0;
	}


	.record-link {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		margin: -0.75rem 0 1.25rem;
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		text-decoration: none;
	}

	.record-link strong { color: var(--color-accent); }
	.record-link:hover strong { text-decoration: underline; }

	form {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	fieldset {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: 1rem;
	}

	legend {
		font-weight: 700;
		font-size: var(--text-sm);
		text-transform: uppercase;
		color: var(--color-text-secondary);
		padding: 0 0.25rem;
	}

	.new-session-fields {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
		margin-top: 0.75rem;
	}

	.hint { font-weight: 400; color: var(--color-text-muted); font-size: var(--text-xs); }

	.required { color: var(--color-error); }

	.hint {
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
		margin: 0.4rem 0 0;
	}

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

	.check-label {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		margin-top: 0.9rem;
		font-size: var(--text-sm);
		cursor: pointer;
	}

	.check-label input { margin-top: 0.15rem; }

	.source-choice { display: flex; flex-wrap: wrap; gap: 0 1.5rem; margin-bottom: 0.9rem; }
	.source-choice .check-label { margin-top: 0; }

	.audio-track { margin-top: 0.9rem; }

	.link-remove { margin-left: 0.4rem; }

	.hint.block {
		display: block;
		margin-top: 0.15rem;
	}

	.submit-btn { align-self: flex-start; }

	.batch-unassigned {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 0.6rem;
	}

	.batch-unassigned .hint { margin: 0; }

	.batch-summary {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
	}
</style>
