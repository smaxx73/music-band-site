<script lang="ts">
	import Modal from '$lib/components/Modal.svelte'
	import SongSelect from '$lib/components/SongSelect.svelte'
	import { formatDateOnly } from '$lib/date'
	import { createSession } from '$lib/upload-client'
	import { sortedWithSong } from '$lib/songs'
	import { sessionTypeLabel } from '$lib/types'

	/**
	 * Classer un enregistrement perso dans une session du groupe actif : le carnet sert
	 * à capter ce qu'on n'a pas eu le temps de ranger — la session oubliée avant de jouer,
	 * l'idée venue seule. L'enregistrement **déménage** : il quitte l'espace perso, avec
	 * ses publications s'il en avait. La modale le dit avant de valider.
	 */
	type Target = {
		id: number
		title: string
		publications?: { group_name: string }[]
		comment_count?: number
	}

	let {
		recording,
		groupName = null,
		onclose,
		onclassified
	}: {
		recording: Target
		groupName?: string | null
		onclose: () => void
		/** La prise créée : à l'appelant d'y mener ou de rafraîchir sa liste. */
		onclassified: (recordingId: number) => void
	} = $props()

	type SessionRow = { id: number; date: string; type: string; title: string | null; location: string | null }

	let sessions = $state<SessionRow[]>([])
	let songs = $state<{ id: number; title: string }[]>([])
	let loading = $state(true)
	let loadError = $state<string | null>(null)

	let selectedSession = $state('')
	let selectedSong = $state('')
	let newDate = $state(localToday())
	let newType = $state('repetition')
	let newTitle = $state('')
	let newLocation = $state('')

	let saving = $state(false)
	let error = $state<string | null>(null)

	const publications = $derived(recording.publications ?? [])

	function localToday(): string {
		const d = new Date()
		const pad = (n: number) => String(n).padStart(2, '0')
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
	}

	function sessionLabel(s: SessionRow): string {
		const date = formatDateOnly(s.date, { day: '2-digit', month: 'short', year: 'numeric' })
		const detail = s.title || s.location || sessionTypeLabel(s.type)
		return detail ? `${date} — ${detail}` : date
	}

	// Les deux listes appartiennent au groupe actif, que l'espace perso ignore : elles ne
	// se chargent donc qu'ici, à l'ouverture.
	$effect(() => {
		let cancelled = false
		Promise.all([
			fetch('/api/sessions').then((r) => (r.ok ? r.json() : Promise.reject(new Error('sessions')))),
			fetch('/api/songs').then((r) => (r.ok ? r.json() : Promise.reject(new Error('songs'))))
		])
			.then(([s, g]) => {
				if (cancelled) return
				sessions = s as SessionRow[]
				songs = g as { id: number; title: string }[]
				// La session du jour si elle existe : c'est la répétition qu'on vient de jouer.
				const today = localToday()
				const todaySession = sessions.find((row) => String(row.date).slice(0, 10) === today)
				selectedSession = todaySession ? String(todaySession.id) : 'new'
				loading = false
			})
			.catch(() => {
				if (cancelled) return
				loadError = "Les sessions et morceaux du groupe n'ont pas pu être chargés."
				loading = false
			})
		return () => (cancelled = true)
	})

	async function submit(e: SubmitEvent) {
		e.preventDefault()
		if (saving || !selectedSong) return
		saving = true
		error = null
		try {
			let sessionId: number
			if (selectedSession === 'new') {
				sessionId = await createSession({
					date: newDate,
					type: newType,
					title: newTitle.trim() || undefined,
					location: newLocation.trim() || undefined
				})
				// La session existe : un second essai ne doit pas en créer une autre.
				selectedSession = String(sessionId)
				sessions = [...sessions]
			} else {
				sessionId = Number(selectedSession)
			}

			const res = await fetch(`/api/personal/${recording.id}/take`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ session_id: sessionId, song_id: Number(selectedSong) })
			})
			const json = await res.json().catch(() => ({}))
			if (!res.ok) {
				error =
					res.status === 409 && json.duplicate
						? `Ce son est déjà une prise du groupe : ${json.duplicate.song_title}, prise ${json.duplicate.take}.`
						: (json.error ?? 'Erreur.')
				return
			}
			onclassified(json.id as number)
		} catch (err) {
			error = err instanceof Error ? err.message : 'Erreur réseau.'
		} finally {
			saving = false
		}
	}
</script>

<Modal title="Classer dans une session" onClose={() => !saving && onclose()}>
	<form onsubmit={submit}>
		<div class="modal-body classify">
			<p class="lead">
				« {recording.title} » deviendra une prise{groupName ? ` de ${groupName}` : ''} et
				<strong>quittera ton espace perso</strong>. Son titre et sa note suivent dans la note
				de la prise.
			</p>

			{#if publications.length > 0}
				<p class="message-error">
					{publications.length > 1 ? 'Ses publications' : 'Sa publication'} dans
					{publications.map((p) => p.group_name).join(', ')}
					{#if recording.comment_count}
						et {recording.comment_count} commentaire{recording.comment_count > 1 ? 's' : ''}
					{/if}
					{publications.length > 1 || recording.comment_count ? 'seront supprimés' : 'sera supprimée'}
					avec l'enregistrement : la prise, elle, se commente dans le groupe.
				</p>
			{/if}

			{#if loading}
				<p class="hint">Chargement des sessions et des morceaux…</p>
			{:else if loadError}
				<p class="message-error">{loadError}</p>
			{:else}
				<label class="form-label">
					Session
					<select class="form-input" bind:value={selectedSession} disabled={saving} required>
						<option value="new">+ Nouvelle session</option>
						{#each sessions as s (s.id)}
							<option value={String(s.id)}>{sessionLabel(s)}</option>
						{/each}
					</select>
				</label>

				{#if selectedSession === 'new'}
					<div class="new-session">
						<label class="form-label">
							Date
							<input class="form-input" type="date" bind:value={newDate} required disabled={saving} />
						</label>
						<label class="form-label">
							Type
							<select class="form-input" bind:value={newType} disabled={saving}>
								<option value="repetition">Répétition</option>
								<option value="concert">Concert</option>
								<option value="studio">Studio</option>
								<option value="autre">Autre</option>
							</select>
						</label>
						<label class="form-label wide">
							Titre <span class="hint">(optionnel)</span>
							<input class="form-input" type="text" bind:value={newTitle} disabled={saving} />
						</label>
						<label class="form-label wide">
							Lieu <span class="hint">(optionnel)</span>
							<input class="form-input" type="text" bind:value={newLocation} disabled={saving} />
						</label>
					</div>
				{/if}

				<SongSelect
					{songs}
					bind:value={selectedSong}
					oncreate={(song) => (songs = sortedWithSong(songs, song))}
					label="Morceau"
					required
					disabled={saving}
				/>
			{/if}

			{#if error}<p class="message-error">{error}</p>{/if}
		</div>

		<div class="modal-footer actions">
			<button type="button" class="btn btn-secondary" onclick={onclose} disabled={saving}>Annuler</button>
			<button type="submit" class="btn btn-primary" disabled={saving || loading || !!loadError || !selectedSong}>
				{saving ? 'Classement…' : 'Classer la prise'}
			</button>
		</div>
	</form>
</Modal>

<style>
	.classify { display: flex; flex-direction: column; gap: 0.75rem; }

	.lead { margin: 0; font-size: var(--text-sm); }

	.new-session {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
		padding: 0.6rem;
		background: var(--color-bg-subtle);
		border-radius: var(--radius-md);
	}

	.new-session :global(.wide) { grid-column: 1 / -1; }

	.hint { font-size: var(--text-xs); color: var(--color-text-muted); font-weight: 400; }

	@media (max-width: 480px) {
		.new-session { grid-template-columns: 1fr; }
		.actions > .btn { flex: 1; }
	}
</style>
