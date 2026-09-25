<script lang="ts">
	import type { PageData } from './$types'
	import { goto } from '$app/navigation'
	import { formatDateOnly } from '$lib/date'
	import SongDetails from '$lib/components/SongDetails.svelte'
	import YouTubePlayer from '$lib/components/YouTubePlayer.svelte'
	import Icon from '$lib/components/Icon.svelte'
	import SongSelect from '$lib/components/SongSelect.svelte'
	import PendingImports from '$lib/components/PendingImports.svelte'
	import { sortedWithSong } from '$lib/songs'
	import { parseYouTubeVideoId } from '$lib/youtube'
	import { createSession, DuplicateError, sendAudioFile, type DuplicateInfo } from '$lib/upload-client'

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

	const isSplit = $derived(source === 'audio' && multiTake)
	const sourceReady = $derived(source === 'audio' ? !!file : !!videoId)

	let uploading = $state(false)
	let progress = $state(0)
	let error = $state<string | null>(null)
	let duplicate = $state<DuplicateInfo | null>(null)

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
			return await createSession({
				date: newDate,
				type: newType,
				title: newTitle.trim() || undefined,
				location: newLocation.trim() || undefined
			})
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

<main>
	<div class="page-header">
		<h1>Uploader une prise</h1>
		<a href="/sessions" class="btn btn-ghost btn-sm back-link" onclick={(e) => { if (history.length > 1) { e.preventDefault(); history.back() } }}>← Retour</a>
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
				<select class="form-input" bind:value={selectedSession} required disabled={uploading}>
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
							<option value="repetition">Répétition</option>
							<option value="concert">Concert</option>
							<option value="studio">Studio</option>
							<option value="autre">Autre</option>
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
					<label class="form-label">
						Lieu
						<input class="form-input" type="text" bind:value={newLocation} placeholder="Studio, salle…" disabled={uploading} />
					</label>
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
					onchange={(e) => {
						const input = e.currentTarget as HTMLInputElement
						file = input.files?.[0] ?? null
					}}
				/>
			</label>
			{#if file}
				<p class="hint">
					{file.name} — {(file.size / 1024 / 1024).toFixed(1)} Mo
					<button type="button" class="link-btn" onclick={() => (file = null)} disabled={uploading}>Retirer</button>
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
					disabled={uploading}
					onchange={(e) => {
						const input = e.currentTarget as HTMLInputElement
						file = input.files?.[0] ?? null
					}}
				/>
			</label>
			{#if file}
				<p class="hint">{file.name} — {(file.size / 1024 / 1024).toFixed(1)} Mo</p>
			{/if}

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

		<button
			type="submit"
			class="btn btn-primary submit-btn"
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
	</form>

	<!-- Fichiers longs encore conservés : reprendre une découpe sans renvoyer l'original -->
	<PendingImports imports={data.imports} disabled={uploading} />
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
		margin-bottom: 1.5rem;
	}

	h1 {
		font-size: var(--text-xl);
		margin: 0;
	}

	.back-link { color: var(--color-text-muted); }

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
		font-size: 0.85rem;
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

	.hint { font-weight: 400; color: #aaa; font-size: 0.78rem; }

	.required { color: var(--color-error); }

	.hint {
		font-size: 0.8rem;
		color: #666;
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

	.link-btn {
		background: none;
		border: none;
		padding: 0;
		margin-left: 0.4rem;
		font: inherit;
		color: var(--color-text-muted);
		text-decoration: underline;
		cursor: pointer;
	}

	.hint.block {
		display: block;
		margin-top: 0.15rem;
	}

	.submit-btn {
		font-size: var(--text-base);
		padding: 0.65rem 1.5rem;
		align-self: flex-start;
	}
</style>
