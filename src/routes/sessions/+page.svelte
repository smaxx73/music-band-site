<script lang="ts">
	import type { PageData } from './$types'
	import { invalidateAll, goto } from '$app/navigation'
	import { page } from '$app/state'
	import { formatDateOnly, toDateOnly } from '$lib/date'
	import Modal from '$lib/components/Modal.svelte'
	import MembersInput from '$lib/components/MembersInput.svelte'

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
	const groupMembers = $derived(data.groupMembers as string[])

	// ─── Filtrage / regroupement (côté client : la liste complète est chargée) ───
	let typeFilter = $state<string>('all')

	const typeCounts = $derived.by(() => {
		const counts: Record<string, number> = { all: sessions.length }
		for (const s of sessions) counts[s.type] = (counts[s.type] ?? 0) + 1
		return counts
	})

	const filteredSessions = $derived(
		typeFilter === 'all' ? sessions : sessions.filter((s) => s.type === typeFilter)
	)

	// Repères temporels : les sessions arrivent déjà triées par date décroissante
	type YearGroup = { year: number; sessions: SessionRow[] }

	const sessionsByYear = $derived.by(() => {
		const groups: YearGroup[] = []
		for (const s of filteredSessions) {
			const year = new Date(s.date).getFullYear()
			const last = groups[groups.length - 1]
			if (last?.year === year) last.sessions.push(s)
			else groups.push({ year, sessions: [s] })
		}
		return groups
	})

	let showCreateModal = $state(false)
	let creating = $state(false)
	let createError = $state<string | null>(null)
	let createSuccess = $state<string | null>(null)

	let newDate = $state('')
	let newType = $state<SessionType>('repetition')
	let newTitle = $state('')
	let newLocation = $state('')
	// Par défaut, tout le groupe est présent : c'est le cas courant, et on retire
	// les absents d'un clic plutôt que de retaper les présents à chaque session.
	let newMembers = $state<string[]>([])
	let newNotes = $state('')
	let newLinkEventId = $state<number | null>(null)

	function openCreateModal() {
		newDate = toDateOnly(new Date())
		newType = 'repetition'
		newTitle = ''
		newLocation = ''
		newMembers = [...groupMembers]
		newNotes = ''
		newLinkEventId = null
		createError = null
		createSuccess = null
		showCreateModal = true
	}

	// Arrivée depuis « Créer la session » sur un événement d'agenda (dashboard ou /agenda) :
	// la modale s'ouvre pré-remplie, et la création liera l'événement au lieu d'en dupliquer un.
	let prefillHandled = false
	$effect(() => {
		if (prefillHandled) return
		const params = page.url.searchParams
		const linkEventId = params.get('link_event_id')
		if (!linkEventId || !/^\d+$/.test(linkEventId)) return
		prefillHandled = true

		newDate = params.get('date') && /^\d{4}-\d{2}-\d{2}$/.test(params.get('date')!)
			? params.get('date')!
			: toDateOnly(new Date())
		const typeParam = params.get('type')
		newType = (['repetition', 'concert', 'studio', 'autre'] as const).includes(typeParam as SessionType)
			? (typeParam as SessionType)
			: 'repetition'
		newTitle = params.get('title') ?? ''
		newLocation = params.get('location') ?? ''
		newMembers = [...groupMembers]
		newNotes = ''
		newLinkEventId = parseInt(linkEventId, 10)
		createError = null
		createSuccess = null
		showCreateModal = true

		goto('/sessions', { replaceState: true, noScroll: true, keepFocus: true })
	})

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
					link_event_id: newLinkEventId,
					members: newMembers
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
		<div class="type-filters">
			<button
				class="filter-pill"
				class:active={typeFilter === 'all'}
				onclick={() => (typeFilter = 'all')}
			>Toutes <span class="pill-count">{typeCounts.all}</span></button>
			{#each Object.entries(typeLabels) as [value, label]}
				{#if typeCounts[value]}
					<button
						class="filter-pill"
						class:active={typeFilter === value}
						onclick={() => (typeFilter = value)}
					>{label} <span class="pill-count">{typeCounts[value]}</span></button>
				{/if}
			{/each}
		</div>

		{#each sessionsByYear as group (group.year)}
			<section class="year-group">
				<h2 class="year-heading">
					{group.year}
					<span class="year-count">
						{group.sessions.length} session{group.sessions.length > 1 ? 's' : ''}
					</span>
				</h2>

				<ul class="sessions-list">
					{#each group.sessions as s}
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
			</section>
		{/each}
	{/if}
</main>

{#if showCreateModal}
	<Modal title="Nouvelle session" onClose={() => (showCreateModal = false)}>
		<form onsubmit={createSession}>
			<div class="modal-body">
				{#if createError}
					<p class="message-error">{createError}</p>
				{/if}
				{#if newLinkEventId}
					<p class="message-info">Cette session sera liée à l'événement déjà prévu dans l'agenda.</p>
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
					<div class="form-label">
						Membres présents
						<MembersInput bind:members={newMembers} suggestions={groupMembers} disabled={creating} />
					</div>
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

	.type-filters {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		margin-bottom: 1.5rem;
	}

	.filter-pill {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		background: var(--color-bg-subtle);
		border: 1px solid var(--color-border-light);
		border-radius: 999px;
		padding: 0.25rem 0.7rem;
		font-size: var(--text-xs);
		font-family: inherit;
		color: var(--color-text-secondary);
		cursor: pointer;
		transition: background 0.1s, color 0.1s, border-color 0.1s;
	}

	.filter-pill:hover { border-color: var(--color-border); }

	.filter-pill.active {
		background: var(--color-ink);
		border-color: var(--color-ink);
		color: #fff;
	}

	.pill-count {
		font-size: 0.65rem;
		font-weight: 700;
		opacity: 0.65;
	}

	.year-group { margin-bottom: 1.75rem; }

	.year-heading {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		font-size: var(--text-sm);
		font-weight: 700;
		color: var(--color-text-muted);
		letter-spacing: 0.04em;
		margin: 0 0 0.6rem;
		padding-bottom: 0.3rem;
		border-bottom: 1px solid var(--color-border-light);
	}

	.year-count {
		font-size: var(--text-xs);
		font-weight: 400;
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
