<script lang="ts">
	import type { PageData, Snapshot } from './$types'
	import { invalidateAll, goto } from '$app/navigation'
	import { tick, untrack } from 'svelte'
	import { page } from '$app/state'
	import { formatDateOnly, localDateOnly, toDateOnly } from '$lib/date'
	import { searchKey, searchTerms } from '$lib/search'
	import Icon from '$lib/components/Icon.svelte'
	import Modal from '$lib/components/Modal.svelte'
	import MembersInput from '$lib/components/MembersInput.svelte'
	import LocationInput from '$lib/components/LocationInput.svelte'
	import SessionHeader from '$lib/components/SessionHeader.svelte'
	import { SESSION_PHOTO_VEIL, sessionPhotoUrl } from '$lib/session-photo'
	import { SESSION_TYPES, formatDurationLong, sessionTypeLabel, type SessionType } from '$lib/types'
	import type { Coords } from '$lib/places'

	let { data }: { data: PageData } = $props()


	type SessionRow = {
		id: number
		date: string
		type: SessionType
		title: string | null
		location: string | null
		members: string[]
		song_count: number
		recording_count: number
		total_duration_s: number
		photo_version: number | null
		photo_veil: number | null
		notes: string | null
		song_titles: string[]
	}

	const sessions = $derived(data.sessions as unknown as SessionRow[])
	const groupMembers = $derived(data.groupMembers as string[])

	// ─── À venir / passées ───
	// Jour civil de l'appareil : une session datée d'aujourd'hui est encore à venir —
	// c'est celle qu'on s'apprête à jouer, ou qu'on joue.
	const today = localDateOnly()

	// À venir : la plus proche d'abord, c'est la prochaine qu'on cherche. Les sessions
	// arrivent triées par date décroissante, d'où l'inversion.
	const upcomingSessions = $derived(sessions.filter((s) => toDateOnly(s.date) >= today).reverse())
	const pastSessions = $derived(sessions.filter((s) => toDateOnly(s.date) < today))

	/** « Aujourd'hui », « Demain », « Dans 5 jours », « Dans 3 semaines ». */
	function untilLabel(date: string): string {
		const days = Math.round(
			(Date.parse(`${toDateOnly(date)}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000
		)
		if (days <= 0) return "Aujourd'hui"
		if (days === 1) return 'Demain'
		if (days < 14) return `Dans ${days} jours`
		if (days < 60) return `Dans ${Math.round(days / 7)} semaines`
		return `Dans ${Math.round(days / 30)} mois`
	}

	// ─── Recherche dans les sessions passées (côté client : la liste complète est chargée) ───
	let typeFilter = $state<string>('all')
	let query = $state('')
	const terms = $derived(searchTerms(query))

	// Repliée par défaut : on parcourt la liste bien plus souvent qu'on n'y cherche, et
	// la barre de recherche n'a pas à occuper la hauteur de l'écran en l'attendant.
	let searchOpen = $state(false)
	let searchInput = $state<HTMLInputElement | null>(null)

	async function openSearch() {
		searchOpen = true
		await tick()
		searchInput?.focus()
	}

	// Refermer, c'est renoncer à la recherche : un filtre resté actif derrière une barre
	// repliée cacherait des sessions sans le dire.
	function closeSearch() {
		query = ''
		typeFilter = 'all'
		searchOpen = false
	}

	// Revenir d'une session à la liste retrouve la recherche telle qu'on l'avait laissée.
	export const snapshot: Snapshot<{ query: string; typeFilter: string; searchOpen: boolean }> = {
		capture: () => ({ query, typeFilter, searchOpen }),
		restore: (value) => {
			query = value.query
			typeFilter = value.typeFilter
			searchOpen = value.searchOpen
		}
	}

	const typeCounts = $derived.by(() => {
		const counts: Record<string, number> = { all: pastSessions.length }
		for (const s of pastSessions) counts[s.type] = (counts[s.type] ?? 0) + 1
		return counts
	})

	/**
	 * Tout ce qui peut aider à retrouver une session : ce qu'on y a joué, où, avec qui,
	 * et sa date en toutes lettres — « mars », « 2025 » ou « samedi » la retrouvent.
	 */
	const searchIndex = $derived(
		new Map(
			pastSessions.map((s) => [
				s.id,
				searchKey(
					[
						s.title,
						s.location,
						s.notes,
						sessionTypeLabel(s.type),
						formatDate(s.date),
						...(s.members ?? []),
						...(s.song_titles ?? [])
					]
						.filter(Boolean)
						.join('\n')
				)
			])
		)
	)

	// Chaque mot doit se trouver quelque part : « sunny elise » = Sunny joué chez Élise.
	const filteredSessions = $derived(
		pastSessions.filter((s) => {
			if (typeFilter !== 'all' && s.type !== typeFilter) return false
			if (terms.length === 0) return true
			const haystack = searchIndex.get(s.id) ?? ''
			return terms.every((t) => haystack.includes(t))
		})
	)

	/** Les morceaux joués que la recherche désigne : c'est souvent pour eux qu'on cherche. */
	function matchedSongs(s: SessionRow): string[] {
		if (terms.length === 0) return []
		return (s.song_titles ?? []).filter((title) => {
			const key = searchKey(title)
			return terms.some((t) => key.includes(t))
		})
	}

	function clearSearch() {
		query = ''
		typeFilter = 'all'
	}

	// Repères temporels : les sessions arrivent déjà triées par date décroissante
	type YearGroup = { year: string; sessions: SessionRow[] }

	const sessionsByYear = $derived.by(() => {
		const groups: YearGroup[] = []
		for (const s of filteredSessions) {
			const year = toDateOnly(s.date).slice(0, 4)
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
	let newCoords = $state<Coords | null>(null)
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
		newCoords = null
		newMembers = [...groupMembers]
		newNotes = ''
		newLinkEventId = null
		createError = null
		createSuccess = null
		showCreateModal = true
	}

	// `/sessions?nouvelle` : « Nouvelle session » du menu Ajouter et du tableau de bord
	// arrive ici, modale ouverte — y compris depuis /sessions même, d'où le suivi de l'URL.
	$effect(() => {
		if (!page.url.searchParams.has('nouvelle')) return
		untrack(openCreateModal)
		goto('/sessions', { replaceState: true, noScroll: true, keepFocus: true })
	})

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
		newType = SESSION_TYPES.includes(typeParam as SessionType)
			? (typeParam as SessionType)
			: 'repetition'
		newTitle = params.get('title') ?? ''
		newLocation = params.get('location') ?? ''
		newCoords = null
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
		const location = newLocation.trim() || null
		try {
			const res = await fetch('/api/sessions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					date: newDate,
					type: newType,
					title: newTitle.trim() || null,
					location,
					location_coords: location ? newCoords : null,
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

	function upcomingStats(s: SessionRow) {
		// Une session à venir n'a encore rien d'enregistré : « 0 prise » n'apprend rien,
		// le temps qui reste, si. Celle du jour peut déjà avoir ses prises.
		return [untilLabel(s.date), s.recording_count > 0 ? sessionStats(s) : null]
			.filter(Boolean)
			.join(' · ')
	}

	function sessionStats(s: SessionRow) {
		return [
			`${s.song_count} morceau${s.song_count > 1 ? 'x' : ''}`,
			`${s.recording_count} prise${s.recording_count > 1 ? 's' : ''}`,
			s.total_duration_s > 0 ? formatDurationLong(s.total_duration_s) : null
		].filter(Boolean).join(' · ')
	}
</script>

<svelte:head>
	<title>Sessions</title>
</svelte:head>

{#snippet sessionCard(s: SessionRow, stats: string, headingLevel: 3 | 4)}
	<a href="/sessions/{s.id}" class="session-card">
		<SessionHeader
			date={s.date}
			type={s.type ?? 'repetition'}
			title={s.title}
			location={s.location}
			members={s.members ?? []}
			{stats}
			photoUrl={s.photo_version !== null ? sessionPhotoUrl(s.id, s.photo_version) : null}
			veil={s.photo_veil ?? SESSION_PHOTO_VEIL.default}
			{headingLevel}
			linkLocation={false}
		/>
	</a>
{/snippet}

<main class="page">
	<div class="page-header">
		<h1>Sessions</h1>
		<button class="btn btn-primary" onclick={openCreateModal}><Icon name="plus" /> Nouvelle session</button>
	</div>

	{#if createSuccess}
		<p class="message-success">Session « {createSuccess} » créée.</p>
	{/if}

	{#if sessions.length === 0}
		<p class="empty">Aucune session pour l'instant. <a href="/upload">Uploader une première prise →</a></p>
	{:else}
		{#if upcomingSessions.length > 0}
			<section class="period" aria-labelledby="upcoming-heading">
				<h2 class="period-heading" id="upcoming-heading">
					À venir
					<span class="period-count">{upcomingSessions.length}</span>
				</h2>
				<ul class="sessions-list">
					{#each upcomingSessions as s (s.id)}
						<li>{@render sessionCard(s, upcomingStats(s), 3)}</li>
					{/each}
				</ul>
			</section>
		{/if}

		<section class="period" aria-labelledby="past-heading">
			<div class="period-bar">
				<h2 class="period-heading" id="past-heading">
					Passées
					<span class="period-count">{pastSessions.length}</span>
				</h2>
				{#if pastSessions.length > 0}
					<button
						type="button"
						class="btn btn-ghost btn-sm"
						aria-expanded={searchOpen}
						aria-controls="session-search"
						onclick={() => (searchOpen ? closeSearch() : openSearch())}
					>
						<Icon name={searchOpen ? 'close' : 'search'} size="0.9rem" />
						{searchOpen ? 'Fermer' : 'Rechercher'}
					</button>
				{/if}
			</div>

			{#if pastSessions.length === 0}
				<p class="empty">Aucune session passée pour l'instant.</p>
			{:else}
				{#if searchOpen}
					<div class="filters" role="search" id="session-search">
						<input
							bind:this={searchInput}
							class="form-input search-input"
							type="search"
							placeholder="Morceau joué, lieu, présent, titre, mois…"
							aria-label="Rechercher une session passée"
							bind:value={query}
							onkeydown={(e) => {
								// Échap sur un champ vide referme ; sur un champ rempli, le navigateur l'efface d'abord.
								if (e.key === 'Escape' && !query) closeSearch()
							}}
							autocomplete="off"
						/>
						<div class="type-filters">
							<button
								class="filter-pill"
								class:active={typeFilter === 'all'}
								onclick={() => (typeFilter = 'all')}
							>Toutes <span class="pill-count">{typeCounts.all}</span></button>
							{#each SESSION_TYPES as value}
								{#if typeCounts[value]}
									<button
										class="filter-pill"
										class:active={typeFilter === value}
										onclick={() => (typeFilter = value)}
									>{sessionTypeLabel(value)} <span class="pill-count">{typeCounts[value]}</span></button>
								{/if}
							{/each}
						</div>
					</div>
				{/if}

				{#if terms.length > 0 || typeFilter !== 'all'}
					<p class="results" aria-live="polite">
						{#if filteredSessions.length === 0}
							Aucune session passée ne correspond.
						{:else}
							{filteredSessions.length} session{filteredSessions.length > 1 ? 's' : ''}
							trouvée{filteredSessions.length > 1 ? 's' : ''}.
						{/if}
						<button type="button" class="btn-link" onclick={clearSearch}>Tout afficher</button>
					</p>
				{/if}

				<!-- Plusieurs années de répétitions sont longues à faire défiler : on saute à l'année. -->
				{#if sessionsByYear.length > 1}
					<nav class="year-jump" aria-label="Aller à une année">
						{#each sessionsByYear as group (group.year)}
							<a href="#annee-{group.year}" class="filter-pill">
								{group.year} <span class="pill-count">{group.sessions.length}</span>
							</a>
						{/each}
					</nav>
				{/if}

				{#each sessionsByYear as group (group.year)}
					<section class="year-group" id="annee-{group.year}">
						<h3 class="year-heading">
							{group.year}
							<span class="year-count">
								{group.sessions.length} session{group.sessions.length > 1 ? 's' : ''}
							</span>
						</h3>

						<ul class="sessions-list">
							{#each group.sessions as s (s.id)}
								{@const songs = matchedSongs(s)}
								<li>
									{@render sessionCard(s, sessionStats(s), 4)}
									{#if songs.length > 0}
										<p class="match">
											<Icon name="music" size="0.8rem" label="Morceaux joués" />
											{songs.join(' · ')}
										</p>
									{/if}
								</li>
							{/each}
						</ul>
					</section>
				{/each}
			{/if}
		</section>
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
								{#each SESSION_TYPES as value}
									<option {value}>{sessionTypeLabel(value)}</option>
								{/each}
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
					<LocationInput
						bind:value={newLocation}
						bind:coords={newCoords}
						disabled={creating}
					/>
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
		color: var(--color-text-muted);
		font-size: var(--text-xs);
	}

	.message-success { margin-bottom: 1rem; }

	textarea.form-input { resize: vertical; }

	@media (max-width: 640px) {


		.fields-row { grid-template-columns: 1fr; }

		.filters { gap: 0.5rem; }
		.search-input { flex-basis: 100%; }
	}

	.period { margin-bottom: 2.25rem; }

	.period-heading {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		font-size: var(--text-lg);
		margin: 0 0 0.9rem;
	}

	.period-bar {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.9rem;
	}

	.period-bar .period-heading { margin: 0; }

	.period-count {
		font-size: var(--text-sm);
		font-weight: 400;
		color: var(--color-text-muted);
	}

	.filters {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem;
		margin-bottom: 1rem;
	}

	.search-input {
		flex: 1 1 260px;
		min-width: 0;
	}

	.type-filters,
	.year-jump {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}

	.year-jump { margin-bottom: 1.25rem; }

	.results {
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		margin: 0 0 1rem;
	}

	.results .btn-link { margin-left: 0.35rem; }

	.match {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		margin: 0.35rem 0 0 0.5rem;
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
	}

	.filter-pill {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		background: var(--color-bg-subtle);
		border: 1px solid var(--color-border-light);
		border-radius: var(--radius-pill);
		padding: 0.25rem 0.7rem;
		font-size: var(--text-xs);
		font-family: inherit;
		color: var(--color-text-secondary);
		text-decoration: none;
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
		font-size: var(--text-2xs);
		font-weight: 700;
		opacity: 0.65;
	}

	.year-group {
		margin-bottom: 1.75rem;
		/* Un saut à l'année ne doit pas glisser son intitulé sous la barre du haut. */
		scroll-margin-top: 4.5rem;
	}

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
		border-radius: var(--radius-xl);
		text-decoration: none;
		color: inherit;
		transition: box-shadow 0.15s;
	}

	.session-card:hover {
		box-shadow: var(--shadow-popover);
	}

	.session-card:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 3px;
	}

	.session-card :global(.mh-frame) {
		margin-bottom: 0;
	}
</style>
