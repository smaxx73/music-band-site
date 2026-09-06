<script lang="ts">
	import type { PageData } from './$types'
	import { invalidateAll } from '$app/navigation'
	import { formatDateOnly, toDateOnly } from '$lib/date'
	import Modal from '$lib/components/Modal.svelte'

	let { data }: { data: PageData } = $props()

	type SessionType = 'repetition' | 'concert' | 'studio' | 'autre'

	type SessionRow = {
		id: number
		date: string
		type: string
		title: string | null
		location: string | null
		members: string[]
		song_count: number
		recording_count: number
	}

	const typeLabels: Record<string, string> = {
		repetition: 'Répétition',
		concert: 'Concert',
		studio: 'Studio',
		autre: 'Autre',
	}

	const sessions = $derived(data.sessions as unknown as SessionRow[])

	let showCreateModal = $state(false)
	let creating = $state(false)
	let createError = $state<string | null>(null)
	let createSuccess = $state<string | null>(null)

	let newDate = $state('')
	let newType = $state<SessionType>('repetition')
	let newTitle = $state('')
	let newLocation = $state('')
	let newMembers = $state('')
	let newNotes = $state('')

	function openCreateModal() {
		newDate = toDateOnly(new Date())
		newType = 'repetition'
		newTitle = ''
		newLocation = ''
		newMembers = ''
		newNotes = ''
		createError = null
		createSuccess = null
		showCreateModal = true
	}

	async function createSession(event: SubmitEvent) {
		event.preventDefault()

		if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
			createError = 'Date invalide (YYYY-MM-DD attendu).'
			return
		}

		creating = true
		createError = null
		try {
			const res = await fetch('/api/sessions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					date: newDate,
					type: newType,
					title: newTitle.trim() || null,
					location: newLocation.trim() || null,
					notes: newNotes.trim() || null,
					members: newMembers
						.split(',')
						.map((member) => member.trim())
						.filter(Boolean)
				})
			})
			const json = await res.json()
			if (!res.ok) {
				createError = json.error ?? 'Erreur lors de la création.'
				return
			}

			await invalidateAll()
			showCreateModal = false
			createSuccess = json.title ?? formatDate(json.date)
		} catch {
			createError = 'Erreur réseau.'
		} finally {
			creating = false
		}
	}

	function formatDate(d: string | Date) {
		return formatDateOnly(d, {
			weekday: 'long',
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		})
	}
</script>

<svelte:head>
	<title>Sessions</title>
</svelte:head>

<main>
	<div class="page-header">
		<h1>Sessions</h1>
		<button class="btn btn-primary" onclick={openCreateModal}>+ Nouvelle session</button>
	</div>

	{#if createSuccess}
		<p class="message-success">Session « {createSuccess} » créée.</p>
	{/if}

	{#if sessions.length === 0}
		<p class="empty">Aucune session pour l'instant. <a href="/upload">Uploader une première prise →</a></p>
	{:else}
		<ul class="sessions-list">
			{#each sessions as s}
				<li>
					<a href="/sessions/{s.id}" class="session-card">
						<div class="session-top">
							<span class="type-badge type-{s.type ?? 'repetition'}">{typeLabels[s.type] ?? s.type}</span>
							<div class="session-date">{s.title ?? formatDate(s.date)}</div>
						</div>
						{#if s.title}
							<div class="session-location">{formatDate(s.date)}</div>
						{:else if s.location}
							<div class="session-location">{s.location}</div>
						{/if}
						<div class="session-meta">
							{s.song_count} morceau{s.song_count > 1 ? 'x' : ''} ·
							{s.recording_count} prise{s.recording_count > 1 ? 's' : ''}
							{#if s.members?.length}
								· {s.members.join(', ')}
							{/if}
						</div>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</main>

{#if showCreateModal}
	<Modal title="Nouvelle session" onClose={() => (showCreateModal = false)}>
		<form onsubmit={createSession}>
			<div class="modal-body">
				{#if createError}
					<p class="message-error">{createError}</p>
				{/if}
				<div class="fields">
					<div class="fields-row">
						<label class="form-label">
							Type
							<select class="form-input" bind:value={newType} disabled={creating}>
								<option value="repetition">Répétition</option>
								<option value="concert">Concert</option>
								<option value="studio">Studio</option>
								<option value="autre">Autre</option>
							</select>
						</label>
						<label class="form-label">
							Date <span class="required">*</span>
							<input class="form-input" type="date" bind:value={newDate} required disabled={creating} />
						</label>
					</div>
					<label class="form-label">
						Titre <span class="hint">(optionnel)</span>
						<input
							class="form-input"
							type="text"
							placeholder="ex : Répète avant Ducasse"
							bind:value={newTitle}
							disabled={creating}
						/>
					</label>
					<label class="form-label">
						Lieu
						<input
							class="form-input"
							type="text"
							placeholder="ex : Studio, Salle des fêtes…"
							bind:value={newLocation}
							disabled={creating}
						/>
					</label>
					<label class="form-label">
						Membres présents <span class="hint">(séparés par des virgules)</span>
						<input
							class="form-input"
							type="text"
							placeholder="Marc, Julie, Thomas"
							bind:value={newMembers}
							disabled={creating}
						/>
					</label>
					<label class="form-label">
						Notes
						<textarea class="form-input" rows="3" bind:value={newNotes} disabled={creating}></textarea>
					</label>
				</div>
			</div>
			<div class="modal-footer">
				<button
					type="button"
					class="btn btn-ghost"
					onclick={() => (showCreateModal = false)}
					disabled={creating}
				>
					Annuler
				</button>
				<button type="submit" class="btn btn-primary" disabled={creating}>
					{creating ? 'Création…' : 'Créer'}
				</button>
			</div>
		</form>
	</Modal>
{/if}

<style>
	main {
		max-width: 680px;
		margin: 2rem auto;
		padding: 0 1rem;
	}

	.page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1.5rem;
	}

	h1 {
		font-size: var(--text-xl);
		margin: 0;
	}

	.fields {
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
	}

	.fields-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.65rem;
	}

	.required { color: var(--color-error); }

	.hint {
		font-weight: 400;
		color: #aaa;
		font-size: 0.78rem;
	}

	.message-success { margin-bottom: 1rem; }

	textarea.form-input { resize: vertical; }

	@media (max-width: 640px) {
		main { margin: 1rem auto; }

		.page-header {
			flex-direction: column;
			align-items: stretch;
			gap: 0.75rem;
		}

		.fields-row { grid-template-columns: 1fr; }
	}

	.sessions-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.session-card {
		display: block;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-xl);
		padding: 1rem 1.25rem;
		text-decoration: none;
		color: inherit;
		transition: border-color 0.15s, box-shadow 0.15s;
	}

	.session-card:hover {
		border-color: #aaa;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.07);
	}

	.session-top {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.1rem;
	}

	.type-badge {
		font-size: 0.68rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		padding: 0.1rem 0.45rem;
		border-radius: var(--radius-sm);
		white-space: nowrap;
		flex-shrink: 0;
	}

	.type-badge.type-repetition { background: var(--color-accent-light); color: var(--color-accent); }
	.type-badge.type-concert    { background: var(--color-green-light);  color: var(--color-green); }
	.type-badge.type-studio     { background: #f3e8ff; color: #7c3aed; }
	.type-badge.type-autre      { background: var(--color-bg-subtle);    color: var(--color-text-secondary); }

	.session-date {
		font-weight: 700;
		font-size: var(--text-base);
	}

	.session-location {
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		margin-top: 0.15rem;
	}

	.session-meta {
		font-size: 0.8rem;
		color: var(--color-text-muted);
		margin-top: 0.4rem;
	}
</style>
