<script lang="ts">
	import type { PageData } from './$types'
	import { formatDateOnly } from '$lib/date'
	import SongDetails from '$lib/components/SongDetails.svelte'

	let { data }: { data: PageData } = $props()

	type SessionRow = { id: number; date: string; location: string | null }
	type SongRow = { id: number; title: string; lyrics: string | null; music_notes: string | null }

	const sessions = $derived(data.sessions as unknown as SessionRow[])
	const songs = $derived(data.songs as unknown as SongRow[])
	const selectedSongData = $derived(songs.find((song) => String(song.id) === selectedSong) ?? null)

	let selectedSession = $state<string>('')
	let newDate = $state('')
	let newType = $state('repetition')
	let newTitle = $state('')
	let newLocation = $state('')
	let selectedSong = $state<string>('')
	let file = $state<File | null>(null)

	let uploading = $state(false)
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

		if (!selectedSong) { error = 'Sélectionne un morceau.'; return }
		if (!file) { error = 'Sélectionne un fichier audio.'; return }

		uploading = true

		try {
			let sessionId: number

			if (selectedSession === 'new') {
				if (!newDate) { error = 'Saisis la date de la session.'; uploading = false; return }
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
				if (!res.ok) { error = json.error ?? 'Erreur création session.'; uploading = false; return }
				sessionId = json.id
			} else {
				sessionId = parseInt(selectedSession)
				if (isNaN(sessionId)) { error = 'Session invalide.'; uploading = false; return }
			}

			const result = await uploadWithProgress(sessionId, parseInt(selectedSong), file)
			successId = result.id
			successSessionId = sessionId
			file = null
			selectedSession = ''
			selectedSong = ''
			newDate = ''
			newType = 'repetition'
			newTitle = ''
			newLocation = ''
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

	class DuplicateError extends Error {
		duplicate: { id: number; take: number; session_date: string; song_title: string }
		constructor(d: DuplicateError['duplicate']) {
			super('doublon')
			this.duplicate = d
		}
	}

	function uploadWithProgress(sessionId: number, songId: number, f: File): Promise<{ id: number }> {
		return new Promise((resolve, reject) => {
			const formData = new FormData()
			formData.append('session_id', String(sessionId))
			formData.append('song_id', String(songId))
			formData.append('audio', f)

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
					reject(new Error('Réponse invalide du serveur.'))
				}
			}

			xhr.onerror = () => reject(new Error('Erreur réseau.'))

			xhr.open('POST', '/api/upload')
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

		<!-- Morceau -->
		<fieldset>
			<legend>Morceau</legend>
			{#if songs.length === 0}
				<p class="hint">
					Aucun morceau disponible.
					<a href="/admin/songs">Ajouter des morceaux →</a>
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
		</fieldset>

		<!-- Progression -->
		{#if uploading}
			<div class="progress-bar">
				<div class="progress-bar-fill" style="width: {progress}%"></div>
			</div>
			<p class="hint center">
				{#if progress < 100}
					Envoi en cours… {progress}%
				{:else}
					Conversion audio en cours…
				{/if}
			</p>
		{/if}

		<button type="submit" class="btn btn-primary submit-btn" disabled={uploading || !file || !selectedSession || !selectedSong}>
			{uploading ? 'Upload en cours…' : 'Uploader'}
		</button>
	</form>
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

	.submit-btn {
		font-size: var(--text-base);
		padding: 0.65rem 1.5rem;
		align-self: flex-start;
	}
</style>
