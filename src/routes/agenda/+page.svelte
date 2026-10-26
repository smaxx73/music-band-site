<script lang="ts">
	import { localDateOnly } from '$lib/date'
	import { SESSION_TYPES, sessionTypeLabel, type SessionType } from '$lib/types'
	import type { PageData } from './$types'
	import { tick, untrack } from 'svelte'
	import { goto, invalidateAll } from '$app/navigation'
	import Icon from '$lib/components/Icon.svelte'
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte'
	import LocationInput from '$lib/components/LocationInput.svelte'
	import { findPlace, locationDetails, type Coords, type GroupPlace } from '$lib/places'
	import EventAttendance from '$lib/components/EventAttendance.svelte'
	import type { EventAttendance as EventAttendanceData } from '$lib/attendance'
	import { eventEndTime, formatEventTime } from '$lib/event-time'

	let { data }: { data: PageData } = $props()

	type CalendarEventRow = {
		id: number
		date: string
		type: 'indisponibilite' | SessionType
		author: string
		user_id: number | null
		title: string | null
		notes: string | null
		location: string | null
		session_id: number | null
		session_date: string | null
		session_location: string | null
		location_lat: number | null
		location_lon: number | null
		start_time: string | null
		duration_min: number | null
		attendance_requested: boolean
	}

	// Lieux du groupe, pour relire l'adresse d'un lieu d'événement : c'est l'étiquette qui
	// la désigne. Une indisponibilité n'en a pas — son lieu est personnel.
	const places = $derived(data.places as GroupPlace[])

	function eventLocation(event: CalendarEventRow) {
		const coords: Coords | null =
			event.location_lat !== null && event.location_lon !== null
				? { lat: event.location_lat, lon: event.location_lon }
				: null
		const place = event.type === 'indisponibilite' ? null : findPlace(places, event.location)
		return locationDetails(event.location, place, coords)
	}

	type SessionRow = {
		id: number
		date: string
		location: string | null
	}

	const events = $derived(data.events as unknown as CalendarEventRow[])
	const sessions = $derived(data.sessions as unknown as SessionRow[])
	const userName = $derived(data.userName as string)
	const userId = $derived(data.userId as number)

	// Présences par événement ; une réponse ou une relance les remplace sur place, sans
	// recharger le mois.
	let attendance = $derived(data.attendance as Record<number, EventAttendanceData>)

	function attendanceFor(event: CalendarEventRow): EventAttendanceData {
		return (
			attendance[event.id] ?? {
				event_id: event.id,
				requested: event.attendance_requested,
				open: false,
				members: []
			}
		)
	}

	function updateAttendance(updated: EventAttendanceData) {
		attendance = { ...attendance, [updated.event_id]: updated }
	}

	const calYear = $derived(Number(data.month.split('-')[0]))
	const calMonth = $derived(Number(data.month.split('-')[1]))

	const monthLabel = $derived(
		new Date(calYear, calMonth - 1, 1).toLocaleDateString('fr-FR', {
			month: 'long',
			year: 'numeric'
		})
	)

	const calDays = $derived(buildCalendarDays(calYear, calMonth))

	function buildCalendarDays(y: number, m: number): (number | null)[] {
		const firstDay = new Date(y, m - 1, 1)
		const daysInMonth = new Date(y, m, 0).getDate()
		let startDow = firstDay.getDay() - 1
		if (startDow < 0) startDow = 6
		const cells: (number | null)[] = []
		for (let i = 0; i < startDow; i++) cells.push(null)
		for (let d = 1; d <= daysInMonth; d++) cells.push(d)
		while (cells.length % 7 !== 0) cells.push(null)
		return cells
	}

	function dateStr(day: number) {
		return `${calYear}-${String(calMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`
	}

	function eventsForDay(day: number) {
		const d = dateStr(day)
		return events.filter((e) => e.date === d)
	}

	function groupEventsForDay(day: number) {
		const d = dateStr(day)
		return events.filter((e) => e.date === d && e.type !== 'indisponibilite')
	}

	function unavailsForDay(day: number) {
		const d = dateStr(day)
		return events.filter((e) => e.date === d && e.type === 'indisponibilite')
	}

	// Jour de l'appareil : `toISOString` donnerait celui de Greenwich, et la case du jour
	// resterait sur la veille jusqu'à 1 h ou 2 h du matin.
	const today = localDateOnly()

	const isCurrentMonth = $derived(
		data.month ===
			(() => {
				const now = new Date()
				return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
			})()
	)

	function prevMonth() {
		let y = calYear,
			m = calMonth - 1
		if (m < 1) {
			y--
			m = 12
		}
		selectedDay = null
		goto(`/agenda?month=${y}-${String(m).padStart(2, '0')}`)
	}

	function nextMonth() {
		let y = calYear,
			m = calMonth + 1
		if (m > 12) {
			y++
			m = 1
		}
		selectedDay = null
		goto(`/agenda?month=${y}-${String(m).padStart(2, '0')}`)
	}

	function goToday() {
		const now = new Date()
		selectedDay = null
		goto(`/agenda?month=${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
	}

	// Form state
	let selectedDay: number | null = $state(null)
	let formType: 'indisponibilite' | SessionType =
		$state('indisponibilite')
	let formTitle = $state('')
	let formNotes = $state('')
	let formLocation = $state('')
	let formCoords = $state<Coords | null>(null)
	let formSessionId = $state('')
	let formStart = $state('')
	let formEnd = $state('')
	let submitting = $state(false)
	let formError = $state('')
	// Au téléphone, le formulaire d'ajout est replié derrière un bouton : on ouvre un jour
	// bien plus souvent pour voir qui vient que pour ajouter. Sur un écran plus large, il
	// reste toujours déplié (voir le CSS) — cet état n'y change rien.
	let formOpen = $state(false)
	let formTypeSelect: HTMLSelectElement | undefined = $state()

	$effect(() => {
		if (formType === 'indisponibilite') {
			formTitle = ''
			formSessionId = ''
			formStart = ''
			formEnd = ''
		}
	})

	const PHONE_QUERY = '(max-width: 640px)'
	let header: HTMLElement | undefined = $state()

	function selectDay(day: number) {
		if (selectedDay === day) {
			selectedDay = null
		} else {
			openDayPanel(day)
			revealWeek()
		}
	}

	/**
	 * Au téléphone, le mois se replie sur la semaine du jour choisi et le panneau se lit
	 * juste dessous. Si l'on avait fait défiler la grille, on remonte au titre du mois pour
	 * que la bande de la semaine soit à l'écran.
	 */
	function revealWeek() {
		if (!window.matchMedia(PHONE_QUERY).matches) return
		tick().then(() => {
			if (header && header.getBoundingClientRect().top < 0) {
				const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
				header.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' })
			}
		})
	}

	// Rangée (semaine) du jour choisi dans la grille : au téléphone, seule elle reste.
	const selectedWeek = $derived(selectedDay === null ? null : Math.floor(calDays.indexOf(selectedDay) / 7))

	/** Semaine précédente ou suivante, au même jour de la semaine ; un autre mois se recharge. */
	function shiftWeek(direction: -1 | 1) {
		if (selectedDay === null) return
		const target = new Date(calYear, calMonth - 1, selectedDay + 7 * direction)
		if (target.getMonth() === calMonth - 1) {
			openDayPanel(target.getDate())
			return
		}
		goto(`/agenda?date=${localDateOnly(target)}`, { noScroll: true })
	}

	/** Un jour sans événement s'ouvre sur le formulaire : on l'a touché pour y ajouter. */
	function openDayPanel(day: number, form = eventsForDay(day).length === 0) {
		selectedDay = day
		formOpen = form
		formType = 'indisponibilite'
		formTitle = ''
		formNotes = ''
		formLocation = ''
		formCoords = null
		formSessionId = ''
		formStart = ''
		formEnd = ''
		formError = ''
		editingTimeId = null
	}

	// Jour demandé par l'URL (`?date=`) : panneau ouvert d'emblée, et amené à l'écran —
	// sur téléphone, il est sous toute la grille du mois. Suivi par valeur, pour qu'un
	// rechargement des données après un ajout ne rouvre pas un jour refermé.
	// `&ajouter` (« Ajouter une date » du tableau de bord) l'ouvre sur le formulaire.
	const openDay = $derived(data.openDay)
	let dayPanel: HTMLElement | undefined = $state()
	$effect(() => {
		if (!openDay) return
		// Ni les événements ni le reste des données ne doivent relancer l'ouverture.
		untrack(() => openDayPanel(openDay, data.openForm || undefined))
		tick().then(() => dayPanel?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
	})

	async function addEvent() {
		if (!selectedDay) return
		submitting = true
		formError = ''
		const location = formLocation.trim() || null
		try {
			const res = await fetch('/api/agenda', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					date: dateStr(selectedDay),
					type: formType,
					title: formTitle || null,
					notes: formNotes || null,
					location,
					location_coords: location ? formCoords : null,
					session_id: formSessionId ? parseInt(formSessionId) : null,
					start_time: formStart || null,
					end_time: formStart ? formEnd || null : null
				})
			})
			if (!res.ok) {
				const d = await res.json()
				formError = d.error || "Erreur lors de l'ajout."
			} else {
				formTitle = ''
				formNotes = ''
				formLocation = ''
				formCoords = null
				formSessionId = ''
				formStart = ''
				formEnd = ''
				// Replié, le formulaire laisse voir l'événement qu'on vient d'ajouter.
				formOpen = false
				await invalidateAll()
			}
		} catch {
			formError = 'Erreur réseau.'
		} finally {
			submitting = false
		}
	}

	// Heure d'un événement déjà posé : celle d'une session ne se règle qu'ici.
	let editingTimeId = $state<number | null>(null)
	let editStart = $state('')
	let editEnd = $state('')
	let timeSaving = $state(false)
	let timeError = $state('')

	function startTimeEdit(event: CalendarEventRow) {
		editingTimeId = event.id
		editStart = event.start_time ?? ''
		editEnd = eventEndTime(event.start_time, event.duration_min) ?? ''
		timeError = ''
	}

	async function saveTime(event: CalendarEventRow) {
		timeSaving = true
		timeError = ''
		try {
			const res = await fetch(`/api/agenda/${event.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ start_time: editStart || null, end_time: editStart ? editEnd || null : null })
			})
			if (!res.ok) {
				timeError = (await res.json().catch(() => ({}))).error ?? 'Heure non enregistrée.'
				return
			}
			editingTimeId = null
			await invalidateAll()
		} catch {
			timeError = 'Erreur réseau.'
		} finally {
			timeSaving = false
		}
	}

	let pendingDelete = $state<CalendarEventRow | null>(null)

	const deleteMessage = $derived.by(() => {
		if (!pendingDelete) return ''
		const label = pendingDelete.title || TYPE_LABELS[pendingDelete.type]
		return `« ${label} » du ${fmtDate(pendingDelete.date)} sera retiré de l’agenda.`
	})

	async function deleteEvent() {
		const event = pendingDelete
		pendingDelete = null
		if (!event) return
		const res = await fetch(`/api/agenda/${event.id}`, { method: 'DELETE' })
		if (res.ok) await invalidateAll()
	}

	function canDelete(event: CalendarEventRow) {
		if (event.type === 'indisponibilite') return event.user_id === userId
		// L'événement d'une session part avec elle : sa page porte la suppression.
		return !event.session_id
	}

	// Les 4 types de groupe reflètent sessions.type
	const TYPE_LABELS: Record<string, string> = {
		indisponibilite: 'Indisponible',
		repetition: 'Répétition',
		concert: 'Concert',
		studio: 'Studio',
		autre: 'Autre'
	}

	const selectedDayLabel = $derived(
		selectedDay
			? new Date(`${dateStr(selectedDay)}T00:00:00`).toLocaleDateString('fr-FR', {
					weekday: 'long',
					day: 'numeric',
					month: 'long'
				})
			: ''
	)

	function fmtDate(d: string) {
		return new Date(`${d}T00:00:00`).toLocaleDateString('fr-FR')
	}

	function sessionCreateUrl(event: CalendarEventRow) {
		const params = new URLSearchParams({
			link_event_id: String(event.id),
			date: event.date,
			type: event.type,
		})
		if (event.title) params.set('title', event.title)
		if (event.location) params.set('location', event.location)
		return `/sessions?${params.toString()}`
	}
</script>

<svelte:head>
	<title>Agenda</title>
</svelte:head>

<main class="page page-wide">
	<div class="header" bind:this={header}>
		<button class="btn btn-ghost nav-arrow" onclick={prevMonth}>←</button>
		<h1 class="month-title">{monthLabel}</h1>
		{#if !isCurrentMonth}
			<button class="btn btn-secondary btn-sm" onclick={goToday}>Aujourd'hui</button>
		{/if}
		<button class="btn btn-ghost nav-arrow" onclick={nextMonth}>→</button>
	</div>

	<div class="calendar" class:week-only={selectedDay !== null}>
		{#each ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'] as dow}
			<div class="dow-header">{dow}</div>
		{/each}

		{#each calDays as day, index}
			<div
				class="day-cell"
				class:out-of-week={selectedWeek !== null && Math.floor(index / 7) !== selectedWeek}
				class:day-clickable={day !== null}
				class:day-empty={day === null}
				class:day-today={day !== null && dateStr(day) === today}
				class:day-selected={day !== null && selectedDay === day}
			>
				{#if day !== null}
					<button
						class="day-number"
						aria-pressed={selectedDay === day}
						onclick={() => selectDay(day)}
					>{day}</button>
					<div class="day-events">
						{#each groupEventsForDay(day) as event}
							{#if event.session_id}
								<a
									href="/sessions/{event.session_id}"
									class="event-badge session-type-{event.type}"
									title="Voir la session"
								>
									{#if event.start_time}<span class="badge-time">{event.start_time}</span>{/if}
									{event.title || TYPE_LABELS[event.type]}
								</a>
							{:else}
								<div class="event-badge session-type-{event.type}">
									{#if event.start_time}<span class="badge-time">{event.start_time}</span>{/if}
									{event.title || TYPE_LABELS[event.type]}
								</div>
							{/if}
						{/each}
						{#each unavailsForDay(day) as event}
							<div class="event-badge session-type-indisponibilite">
								<Icon name="close" class="unavail-cross" size="0.7rem" />{event.author}
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/each}
	</div>

	{#if selectedDay !== null}
		<!-- Au téléphone seulement : la grille n'y montre plus que la semaine du jour. -->
		<div class="week-nav">
			<button class="btn btn-ghost btn-sm" onclick={() => shiftWeek(-1)} aria-label="Semaine précédente">
				<Icon name="chevron-left" size="1rem" />
			</button>
			<button class="btn-link btn-link-muted" onclick={() => (selectedDay = null)}>Tout le mois</button>
			<button class="btn btn-ghost btn-sm" onclick={() => shiftWeek(1)} aria-label="Semaine suivante">
				<Icon name="chevron-right" size="1rem" />
			</button>
		</div>
	{/if}

	{#if selectedDay !== null}
		{@const dayGroupEvents = groupEventsForDay(selectedDay)}
		{@const dayUnavails = unavailsForDay(selectedDay)}

		<div class="day-panel" bind:this={dayPanel}>
			<div class="panel-header">
				<h2 class="panel-title">{selectedDayLabel}</h2>
				<button class="btn btn-ghost btn-sm" onclick={() => (selectedDay = null)} aria-label="Fermer le panneau">
					<Icon name="close" size="0.9rem" />
				</button>
			</div>

			<div class="panel-events">
				<!-- Événements du groupe -->
				{#if dayGroupEvents.length > 0}
					<div class="panel-section">
						<span class="panel-section-label">Événements du groupe</span>
						{#each dayGroupEvents as event}
							<div class="panel-event">
								<span class="event-badge session-type-{event.type} panel-event-type">
									{TYPE_LABELS[event.type]}
								</span>
								<div class="panel-event-body">
									<span class="panel-event-name">{event.title || TYPE_LABELS[event.type]}</span>
									{#if editingTimeId === event.id}
										<div class="time-edit">
											<label class="time-field">
												<span>De</span>
												<input class="form-input" type="time" bind:value={editStart} />
											</label>
											<label class="time-field">
												<span>à</span>
												<input class="form-input" type="time" bind:value={editEnd} disabled={!editStart} />
											</label>
											<button class="btn btn-primary btn-sm" onclick={() => saveTime(event)} disabled={timeSaving}>
												Enregistrer
											</button>
											<button class="btn btn-secondary btn-sm" onclick={() => (editingTimeId = null)}>Annuler</button>
										</div>
										{#if timeError}<p class="message-error">{timeError}</p>{/if}
									{:else}
										<span class="panel-event-time">
											{#if event.start_time}
												<Icon name="clock" size="0.8rem" /> {formatEventTime(event.start_time, event.duration_min)}
												<button class="btn-link btn-link-muted" onclick={() => startTimeEdit(event)}>Modifier</button>
											{:else}
												<button class="btn-link btn-link-muted" onclick={() => startTimeEdit(event)}>
													<Icon name="clock" size="0.8rem" /> Ajouter l'heure
												</button>
											{/if}
										</span>
									{/if}
									{#if event.session_id && event.session_date}
										<a href="/sessions/{event.session_id}" class="panel-event-session">
											Session du {fmtDate(event.session_date)}{event.session_location ? ` — ${event.session_location}` : ''}
										</a>
									{:else}
										<a href={sessionCreateUrl(event)} class="panel-event-session panel-event-create">
											Créer la session →
										</a>
									{/if}
									{#if event.location}
										{@const details = eventLocation(event)}
										<span class="panel-event-location">
											<Icon name="pin" size="0.8rem" /> {event.location}
											{#if details.address} · {details.address}{/if}
											{#if details.map}
												<a href={details.map} target="_blank" rel="noopener noreferrer">Carte</a>
											{/if}
										</span>
									{/if}
									{#if event.notes}
										<span class="panel-event-notes">{event.notes}</span>
									{/if}
									<span class="panel-event-meta">par {event.author}</span>
									<EventAttendance
										attendance={attendanceFor(event)}
										{userId}
										upcoming={event.date >= today}
										onchange={updateAttendance}
									/>
								</div>
								{#if canDelete(event)}
									<button
										class="btn btn-ghost btn-sm delete-btn"
										onclick={() => (pendingDelete = event)}
										title="Supprimer"
										aria-label="Supprimer l’événement"
									>
										<Icon name="trash" />
									</button>
								{/if}
							</div>
						{/each}
					</div>
				{/if}

				<!-- Indisponibilités -->
				{#if dayUnavails.length > 0}
					<div class="panel-section">
						<span class="panel-section-label">Indisponibilités</span>
						{#each dayUnavails as event}
							<div class="panel-event">
								<span class="event-badge session-type-indisponibilite panel-event-type">Indispo</span>
								<div class="panel-event-body">
									<span class="panel-event-name">{event.author}</span>
									{#if event.location}
										<span class="panel-event-location"><Icon name="pin" size="0.8rem" /> {event.location}</span>
									{/if}
									{#if event.notes}
										<span class="panel-event-notes">{event.notes}</span>
									{/if}
								</div>
								{#if canDelete(event)}
									<button
										class="btn btn-ghost btn-sm delete-btn"
										onclick={() => (pendingDelete = event)}
										title="Supprimer"
										aria-label="Supprimer l’événement"
									>
										<Icon name="trash" />
									</button>
								{/if}
							</div>
						{/each}
					</div>
				{/if}

				{#if dayGroupEvents.length === 0 && dayUnavails.length === 0}
					<p class="empty">Aucun événement ce jour.</p>
				{/if}
			</div>

			<div class="panel-form" class:form-collapsed={!formOpen}>
				{#if !formOpen}
					<button
						class="btn btn-secondary btn-sm form-toggle"
						onclick={() => { formOpen = true; tick().then(() => formTypeSelect?.focus()) }}
					>
						<Icon name="plus" /> Ajouter un événement
					</button>
				{/if}
				<div class="form-body">
					<h3 class="form-subtitle">Ajouter un événement</h3>

					<div class="form-row">
						<select class="form-input" bind:value={formType} bind:this={formTypeSelect}>
							<option value="indisponibilite">Indisponible (personnel)</option>
							{#each SESSION_TYPES as value}
								<option {value}>{sessionTypeLabel(value)}</option>
							{/each}
						</select>
					</div>

					{#if formType !== 'indisponibilite'}
						<div class="form-row">
							<input
								class="form-input"
								type="text"
								placeholder="Titre (optionnel)"
								bind:value={formTitle}
							/>
						</div>
						<div class="form-row time-row">
							<label class="time-field">
								<span>De</span>
								<input class="form-input" type="time" bind:value={formStart} aria-label="Heure de début (optionnel)" />
							</label>
							<label class="time-field">
								<span>à</span>
								<input class="form-input" type="time" bind:value={formEnd} disabled={!formStart} aria-label="Heure de fin (optionnel)" />
							</label>
						</div>
						<div class="form-row">
							<select class="form-input" bind:value={formSessionId}>
								<option value="">Aucune session liée</option>
								{#each sessions as s}
									<option value={String(s.id)}>
										{fmtDate(s.date)}{s.location ? ` — ${s.location}` : ''}
									</option>
								{/each}
							</select>
						</div>
					{/if}

					<div class="form-row">
						<LocationInput
							bind:value={formLocation}
							bind:coords={formCoords}
							optional
							hideLabel
						/>
					</div>

					<div class="form-row">
						<input
							class="form-input"
							type="text"
							placeholder="Notes (optionnel)"
							bind:value={formNotes}
						/>
					</div>

					{#if formError}
						<p class="message-error">{formError}</p>
					{/if}

					<div class="form-actions">
						<button class="btn btn-primary btn-sm" onclick={addEvent} disabled={submitting}>
							Ajouter
						</button>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<ConfirmDialog
		open={pendingDelete !== null}
		level="danger"
		title={pendingDelete?.type === 'indisponibilite' ? 'Supprimer cette indisponibilité ?' : 'Supprimer cet événement ?'}
		message={deleteMessage}
		confirmLabel="Supprimer"
		onConfirm={deleteEvent}
		onCancel={() => (pendingDelete = null)}
	/>
</main>

<style>
	.header {
		/* Sous la barre du haut, collée : sinon le titre du mois finirait dessous. */
		scroll-margin-top: var(--top-bar-h);
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1.25rem;
	}

	.month-title {
		font-size: var(--text-xl);
		margin: 0;
		text-transform: capitalize;
		flex: 1;
	}

	.nav-arrow {
		font-size: 1.1rem;
		padding: 0.3rem 0.6rem;
	}

	/* Calendar grid */
	.calendar {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-xl);
		overflow: hidden;
	}

	.dow-header {
		padding: 0.4rem;
		text-align: center;
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--color-text-secondary);
		background: var(--color-bg-subtle);
		border-bottom: 1px solid var(--color-border);
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.day-cell {
		min-height: 88px;
		border-right: 1px solid var(--color-border-light);
		border-bottom: 1px solid var(--color-border-light);
		padding: 0.3rem;
		background: var(--color-bg);
	}

	/* Remove right border on last column */
	.day-cell:nth-child(7n) {
		border-right: none;
	}

	.day-empty {
		background: var(--color-bg-subtle);
	}

	/* Toute la case sélectionne le jour, pour viser large au doigt. Elle ne peut pas être un
	   <button> (elle contient les liens des sessions) : le bouton du numéro étend donc sa zone
	   de clic sur toute la case, et les liens passent au-dessus. */
	.day-clickable {
		position: relative;
		transition: background 0.1s;
	}

	.day-number::after {
		content: '';
		position: absolute;
		inset: 0;
	}

	a.event-badge {
		position: relative;
		z-index: 1;
	}

	.day-clickable:hover {
		background: var(--color-bg-subtle);
	}

	.day-selected,
	.day-selected:hover {
		background: var(--color-bg-muted);
	}

	.day-today .day-number {
		background: var(--color-primary);
		color: #fff;
	}

	.day-number {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		font-size: var(--text-xs);
		font-weight: 600;
		border: none;
		background: none;
		cursor: pointer;
		color: var(--color-text);
		transition: background 0.1s;
		padding: 0;
	}

	.day-clickable:not(.day-today):hover .day-number {
		background: var(--color-bg-muted);
	}

	.day-events {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin-top: 3px;
	}

	.event-badge {
		font-size: var(--text-2xs);
		padding: 1px 4px;
		border-radius: var(--radius-sm);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 100%;
		display: block;
		/* Couleurs du type (`.session-type-*`, src/app.css), communes à toute l'application. */
		background: var(--type-bg);
		color: var(--type-text);
		text-decoration: none;
	}

	a.event-badge:hover {
		text-decoration: underline;
	}

	/* Rendue par Icon.svelte : le style scopé ne l'atteint qu'avec `:global`. */
	:global(.unavail-cross) {
		margin-right: 2px;
		opacity: 0.8;
	}

	/* Day panel */
	.day-panel {
		margin-top: 1.25rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-xl);
		overflow: hidden;
	}

	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.65rem 1rem;
		background: var(--color-bg-subtle);
		border-bottom: 1px solid var(--color-border-light);
	}

	.panel-title {
		font-size: var(--text-base);
		font-weight: 700;
		margin: 0;
		text-transform: capitalize;
	}

	.panel-events {
		padding: 0.75rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.panel-section {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.panel-section + .panel-section {
		padding-top: 0.5rem;
		border-top: 1px solid var(--color-border-light);
	}

	.panel-section-label {
		font-size: var(--text-xs);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-secondary);
		margin-bottom: 0.1rem;
	}

	.panel-event {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
	}

	.panel-event-type {
		flex-shrink: 0;
		margin-top: 1px;
		font-size: var(--text-xs);
		font-weight: 600;
	}

	.panel-event-body {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.panel-event-name {
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.panel-event-session {
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
		text-decoration: none;
	}

	.panel-event-session:hover {
		text-decoration: underline;
	}

	.panel-event-location,
	.panel-event-time {
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
	}

	.panel-event-time .btn-link { font-size: inherit; margin-left: 0.25rem; }
	.panel-event-time :global(.icon) { vertical-align: -1px; }

	.badge-time {
		font-weight: 700;
		margin-right: 0.2rem;
	}

	.time-row,
	.time-edit {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}

	.time-edit { margin: 0.2rem 0; }

	.time-field {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
	}

	.form-row .time-field .form-input,
	.time-field .form-input {
		flex: none;
		width: auto;
	}

	.panel-event-location a { color: inherit; margin-left: 0.25rem; }

	.panel-event-notes {
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
		font-style: italic;
	}

	.panel-event-meta {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
	}

	.delete-btn {
		flex-shrink: 0;
		color: var(--color-text-muted);
	}

	.delete-btn :global(.icon) {
		width: 1rem;
		height: 1rem;
		display: block;
	}

	/* Bande de la semaine : seulement au téléphone, quand un jour est choisi. */
	.week-nav { display: none; }

	/* Le bouton qui déplie le formulaire n'existe qu'au téléphone. */
	.form-toggle { display: none; }

	@media (max-width: 640px) {
		.calendar.week-only .out-of-week { display: none; }

		/* La rangée restante garde ses bords : c'est elle qui ferme la grille. */
		.calendar.week-only .day-cell { border-bottom: none; }

		.week-nav {
			display: flex;
			align-items: center;
			justify-content: space-between;
			margin-top: 0.35rem;
		}

		.week-nav .btn-ghost { min-width: 40px; min-height: 40px; }

		.day-panel { margin-top: 0.5rem; }

		.form-collapsed .form-toggle { display: inline-flex; align-self: flex-start; }
		.form-collapsed .form-body { display: none; }
	}

	.form-body {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	/* Add form */
	.panel-form {
		padding: 0.75rem 1rem;
		border-top: 1px solid var(--color-border-light);
		background: var(--color-bg-subtle);
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.form-subtitle {
		font-size: var(--text-sm);
		font-weight: 700;
		margin: 0 0 0.15rem;
	}

	.form-row {
		display: flex;
	}

	.form-row .form-input {
		flex: 1;
	}

	.form-actions {
		display: flex;
		gap: 0.5rem;
	}

	@media (max-width: 600px) {
		main {
			padding: 0 0.5rem;
		}

		.day-cell {
			min-height: 58px;
			padding: 0.15rem;
		}

		.day-number {
			width: 18px;
			height: 18px;
			font-size: 0.65rem;
		}

		.event-badge {
			font-size: 0.6rem;
			padding: 1px 2px;
		}

		/* Sous 600 px, la case n'a pas la place : l'heure se lit dans le panneau du jour. */
		.badge-time { display: none; }

		.month-title {
			font-size: var(--text-base);
		}
	}
</style>
