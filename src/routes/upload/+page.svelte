<script lang="ts">
	import type { PageData } from './$types'
	import { goto } from '$app/navigation'
	import { formatDateOnly } from '$lib/date'
	import SongDetails from '$lib/components/SongDetails.svelte'

	let { data }: { data: PageData } = $props()

	type SessionRow = { id: number; date: string; location: string | null }
	type SongRow = { id: number; title: string; lyrics: string | null; music_notes: string | null }

	// Les dates arrivent en objets `Date` : SvelteKit les préserve à la sérialisation.
	type ImportRow = {
		id: string
		file_name: string
		duration_s: number | null
		consumed_at: Date | null
		created_at: Date
	}

	const sessions = $derived(data.sessions as unknown as SessionRow[])
	const imports = $derived(data.imports as unknown as ImportRow[])
	const songs = $derived(data.songs as unknown as SongRow[])
	const selectedSongData = $derived(songs.find((song) => String(song.id) === selectedSong) ?? null)

	let selectedSession = $state<string>('')
	let newDate = $state('')
	let newType = $state('repetition')
	let newTitle = $state('')
	let newLocation = $state('')
	let selectedSong = $state<string>('')
	let file = $state<File | null>(null)

	// Une répétition enregistrée d'un bloc contient plusieurs morceaux : le fichier part
	// alors en zone de transit, et c'est l'écran de découpe qui en tire les prises.
	// Le morceau ne se choisit donc pas ici, mais segment par segment.
	let multiTake = $state(false)

	let uploading = $state(false)
	let resuming = $state<string | null>(null)
	let progress = $state(0)
	let successId = $state<number | null>(null)
	let successSessionId = $state<number | null>(null)
	let error = $state<string | null>(null)
	let duplicate = $state<{ id: number; take: number; session_date: string; song_title: string } | null>(null)

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
		successId = null
		duplicate = null
		progress = 0

		if (!multiTake && !selectedSong) { error = 'Sélectionne un morceau.'; return }
		if (!file) { error = 'Sélectionne un fichier audio.'; return }

		uploading = true

		try {
			const sessionId = await resolveSessionId()
			if (sessionId === null) return

			if (multiTake) {
				const audioImport = await sendFile<{ id: string }>('/api/imports', sessionId)
				await goto(`/upload/decoupe/${audioImport.id}`)
				return
			}

			const result = await sendFile<{ id: number }>('/api/upload', sessionId, selectedSong)
			successId = result.id
			successSessionId = sessionId
			resetForm()
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

	/**
	 * Reprend un fichier encore en transit. Une découpe déjà validée doit d'abord être
	 * rouverte côté serveur ; les prises qu'elle a produites restent en place.
	 */
	async function resumeImport(row: ImportRow) {
		if (resuming) return
		error = null
		resuming = row.id

		try {
			if (row.consumed_at) {
				const res = await fetch(`/api/imports/${row.id}/redo`, { method: 'POST' })
				if (!res.ok) {
					const payload = await res.json().catch(() => ({}))
					error = payload.error ?? 'Reprise impossible.'
					return
				}
			}
			await goto(`/upload/decoupe/${row.id}`)
		} finally {
			resuming = null
		}
	}

	function formatLength(seconds: number | null): string {
		if (seconds === null) return ''
		const m = Math.floor(seconds / 60)
		const s = Math.round(seconds % 60)
		return ` · ${m}:${String(s).padStart(2, '0')}`
	}

	/** Session existante, ou création à la volée. `null` = l'erreur est déjà affichée. */
	async function resolveSessionId(): Promise<number | null> {
		if (selectedSession !== 'new') {
			const sessionId = parseInt(selectedSession)
			if (isNaN(sessionId)) { error = 'Session invalide.'; return null }
			return sessionId
		}

		if (!newDate) { error = 'Saisis la date de la session.'; return null }

		const res = await fetch('/api/sessions', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				date: newDate,
				type: newType,
				title: newTitle.trim() || undefined,
				location: newLocation.trim() || undefined,
				members: []
			})
		})
		const json = await res.json()
		if (!res.ok) { error = json.error ?? 'Erreur création session.'; return null }
		return json.id
	}

	function resetForm() {
		file = null
		selectedSession = ''
		selectedSong = ''
		newDate = ''
		newType = 'repetition'
		newTitle = ''
		newLocation = ''
	}

	class DuplicateError extends Error {
		duplicate: { id: number; take: number; session_date: string; song_title: string }
		constructor(d: DuplicateError['duplicate']) {
			super('doublon')
			this.duplicate = d
		}
	}

	/**
	 * XMLHttpRequest plutôt que fetch : c'est le seul moyen de suivre la progression
	 * de l'envoi, qui dure sur un fichier de plusieurs dizaines de Mo.
	 */
	function sendFile<T>(url: string, sessionId: number, songId?: string): Promise<T> {
		return new Promise((resolve, reject) => {
			const formData = new FormData()
			formData.append('session_id', String(sessionId))
			if (songId) formData.append('song_id', songId)
			formData.append('audio', file as File)

			const xhr = new XMLHttpRequest()

			xhr.upload.onprogress = (e) => {
				if (e.lengthComputable) progress = Math.round((e.loaded / e.total) * 100)
			}

			xhr.onload = () => {
				try {
					const data = JSON.parse(xhr.responseText)
					if (xhr.status === 409 && data.duplicate) {
						reject(new DuplicateError(data.duplicate))
					} else if (xhr.status >= 200 && xhr.status < 300) {
						resolve(data)
					} else {
						reject(new Error(data.error ?? `Erreur ${xhr.status}`))
					}
				} catch {
					if (xhr.status === 413) {
						reject(new Error('Fichier trop volumineux (maximum 200 Mo).'))
					} else {
						reject(new Error(`Réponse invalide du serveur (HTTP ${xhr.status}).`))
					}
				}
			}

			xhr.onerror = () => reject(new Error('Erreur réseau.'))

			xhr.open('POST', url)
			xhr.send(formData)
		})
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

	{#if successId}
		<div class="message-success" style="margin-bottom: 1rem;">
			Prise uploadée avec succès !
			<a href="/recording/{successId}">Écouter la prise →</a>
			{#if successSessionId}
				· <a href="/sessions/{successSessionId}">Retour à la session →</a>
			{/if}
		</div>
	{/if}

	{#if duplicate}
		<div class="message-error" style="margin-bottom: 0.75rem;">
			Ce fichier a déjà été uploadé : <strong>{duplicate.song_title}</strong>,
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
			{#if multiTake}
				<p class="hint">
					Chaque segment détecté recevra son propre morceau à l'écran suivant.
				</p>
			{:else if songs.length === 0}
				<p class="hint">
					Aucun morceau disponible.
					<a href="/songs">Ajouter des morceaux →</a>
				</p>
			{:else}
				<label class="form-label">
					Sélectionner un morceau
					<select class="form-input" bind:value={selectedSong} required disabled={uploading}>
						<option value="" disabled>— Choisir —</option>
						{#each songs as s}
							<option value={String(s.id)}>{s.title}</option>
						{/each}
					</select>
				</label>
				{#if selectedSongData}
					<SongDetails
						lyrics={selectedSongData.lyrics}
						musicNotes={selectedSongData.music_notes}
						compact
					/>
				{/if}
			{/if}
		</fieldset>

		<!-- Fichier -->
		<fieldset>
			<legend>Fichier audio</legend>
			<label class="form-label">
				Fichier (mp3, wav, m4a, ogg… — max 200 Mo)
				<input
					type="file"
					accept="audio/*"
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
					Ce fichier contient plusieurs prises
					<span class="hint block">
						La répétition a été enregistrée d'un bloc : les blancs sont repérés
						automatiquement et chaque passage devient une prise à part.
					</span>
				</span>
			</label>
		</fieldset>

		<!-- Progression -->
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
			disabled={uploading || !file || !selectedSession || (!multiTake && !selectedSong)}
		>
			{#if uploading}
				Upload en cours…
			{:else if multiTake}
				Analyser et découper
			{:else}
				Uploader
			{/if}
		</button>
	</form>

	<!-- Fichiers longs encore conservés : reprendre une découpe sans renvoyer l'original -->
	{#if imports.length > 0}
		<section class="imports">
			<h2>Fichiers à découper encore disponibles</h2>
			<p class="hint">
				L'original est conservé une semaine après la découpe : si un segment en
				contenait deux, la reprise évite de renvoyer le fichier.
			</p>
			<ul>
				{#each imports as row}
					<li>
						<span class="import-name">
							{row.file_name}
							<span class="hint">
								{formatDate(row.created_at)}{formatLength(row.duration_s)}
								· {row.consumed_at ? 'découpe validée' : 'découpe en attente'}
							</span>
						</span>
						<button
							type="button"
							class="btn btn-secondary btn-sm"
							onclick={() => resumeImport(row)}
							disabled={resuming !== null || uploading}
						>
							{#if resuming === row.id}
								Ouverture…
							{:else if row.consumed_at}
								Refaire la découpe
							{:else}
								Reprendre
							{/if}
						</button>
					</li>
				{/each}
			</ul>
		</section>
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
		margin-bottom: 1.5rem;
	}

	h1 {
		font-size: var(--text-xl);
		margin: 0;
	}

	.back-link { color: var(--color-text-muted); }

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

	.imports {
		margin-top: 2rem;
		border-top: 1px solid var(--color-border-light);
		padding-top: 1rem;
	}

	.imports h2 {
		font-size: var(--text-sm);
		text-transform: uppercase;
		color: var(--color-text-secondary);
		margin: 0 0 0.25rem;
	}

	.imports ul {
		list-style: none;
		margin: 0.75rem 0 0;
		padding: 0;
	}

	.imports li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.45rem 0;
		border-bottom: 1px solid var(--color-border-light);
	}

	.imports li:last-child { border-bottom: 0; }

	.import-name {
		display: flex;
		flex-direction: column;
		font-size: var(--text-sm);
		min-width: 0;
	}

	.import-name > .hint { margin: 0; }

	.check-label {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		margin-top: 0.9rem;
		font-size: var(--text-sm);
		cursor: pointer;
	}

	.check-label input { margin-top: 0.15rem; }

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
