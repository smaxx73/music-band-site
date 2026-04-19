<script lang="ts">
	import type { PageData } from './$types'

	let { data }: { data: PageData } = $props()

	type SessionRow = { id: number; date: string; location: string | null }
	type SongRow = { id: number; title: string }

	const sessions = $derived(data.sessions as unknown as SessionRow[])
	const songs = $derived(data.songs as unknown as SongRow[])

	let selectedSession = $state<string>('') // 'new' | session id as string
	let newDate = $state('')
	let newLocation = $state('')
	let selectedSong = $state<string>('')
	let file = $state<File | null>(null)

	let uploading = $state(false)
	let progress = $state(0)
	let successId = $state<number | null>(null)
	let error = $state<string | null>(null)

	function formatDate(d: string) {
		return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', {
			day: '2-digit',
			month: 'short',
			year: 'numeric'
		})
	}

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault()
		error = null
		successId = null
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
					body: JSON.stringify({ date: newDate, location: newLocation || undefined, members: [] })
				})
				const json = await res.json()
				if (!res.ok) { error = json.error ?? 'Erreur création session.'; uploading = false; return }
				sessionId = json.id
			} else {
				sessionId = parseInt(selectedSession)
				if (isNaN(sessionId)) { error = 'Session invalide.'; uploading = false; return }
			}

			// Upload via XHR pour suivre la progression
			const result = await uploadWithProgress(sessionId, parseInt(selectedSong), file)
			successId = result.id
			file = null
			selectedSession = ''
			selectedSong = ''
			newDate = ''
			newLocation = ''
		} catch (err) {
			error = err instanceof Error ? err.message : 'Erreur inattendue.'
		} finally {
			uploading = false
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
					if (xhr.status >= 200 && xhr.status < 300) resolve(data)
					else reject(new Error(data.error ?? `Erreur ${xhr.status}`))
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
	<h1>Uploader une prise</h1>

	{#if successId}
		<div class="success">
			Prise uploadée avec succès !
			<a href="/recording/{successId}">Écouter la prise →</a>
		</div>
	{/if}

	{#if error}
		<p class="error">{error}</p>
	{/if}

	<form onsubmit={handleSubmit}>
		<!-- Session -->
		<fieldset>
			<legend>Session</legend>
			<label>
				Sélectionner une session
				<select bind:value={selectedSession} required disabled={uploading}>
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
					<label>
						Date <span class="required">*</span>
						<input type="date" bind:value={newDate} required disabled={uploading} />
					</label>
					<label>
						Lieu
						<input type="text" bind:value={newLocation} placeholder="Studio, salle…" disabled={uploading} />
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
				<label>
					Sélectionner un morceau
					<select bind:value={selectedSong} required disabled={uploading}>
						<option value="" disabled>— Choisir —</option>
						{#each songs as s}
							<option value={String(s.id)}>{s.title}</option>
						{/each}
					</select>
				</label>
			{/if}
		</fieldset>

		<!-- Fichier -->
		<fieldset>
			<legend>Fichier audio</legend>
			<label>
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

		<button type="submit" class="btn-primary" disabled={uploading || !file || !selectedSession || !selectedSong}>
			{uploading ? 'Upload en cours…' : 'Uploader'}
		</button>
	</form>
</main>

<style>
	main {
		max-width: 580px;
		margin: 2rem auto;
		padding: 0 1rem;
		font-family: sans-serif;
	}

	h1 {
		font-size: 1.5rem;
		margin-bottom: 1.5rem;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	fieldset {
		border: 1px solid #e0e0e0;
		border-radius: 6px;
		padding: 1rem;
	}

	legend {
		font-weight: 700;
		font-size: 0.85rem;
		text-transform: uppercase;
		color: #555;
		padding: 0 0.25rem;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-size: 0.875rem;
		font-weight: 600;
	}

	select,
	input[type='date'],
	input[type='text'] {
		padding: 0.45rem 0.6rem;
		border: 1px solid #ccc;
		border-radius: 4px;
		font-size: 0.9rem;
		background: white;
	}

	input[type='file'] {
		font-size: 0.875rem;
	}

	.new-session-fields {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
		margin-top: 0.75rem;
	}

	.required {
		color: #c0392b;
	}

	.hint {
		font-size: 0.8rem;
		color: #666;
		margin: 0.4rem 0 0;
	}

	.hint.center {
		text-align: center;
	}

	.progress-bar {
		height: 8px;
		background: #e0e0e0;
		border-radius: 4px;
		overflow: hidden;
	}

	.progress-bar-fill {
		height: 100%;
		background: #1a1a1a;
		transition: width 0.2s;
	}

	.btn-primary {
		padding: 0.65rem 1.5rem;
		background: #1a1a1a;
		color: white;
		border: none;
		border-radius: 4px;
		font-size: 1rem;
		cursor: pointer;
		align-self: flex-start;
	}

	.btn-primary:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.btn-primary:hover:not(:disabled) {
		background: #333;
	}

	.success {
		background: #dcfce7;
		color: #166534;
		border: 1px solid #bbf7d0;
		border-radius: 6px;
		padding: 0.75rem 1rem;
		margin-bottom: 1rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 0.9rem;
	}

	.success a {
		color: #166534;
		font-weight: 600;
	}

	.error {
		color: #c0392b;
		font-size: 0.875rem;
		margin: 0;
	}
</style>
