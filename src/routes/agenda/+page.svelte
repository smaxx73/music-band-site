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
	import EventProgram from '$lib/components/EventProgram.svelte'
	import EventProgramField from '$lib/components/EventProgramField.svelte'
	import type { EventProgramSong, ProgramSetlist } from '$lib/types'

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

	const programs = $derived(data.programs as Record<number, EventProgramSong[]>)
	const programSongs = $derived(data.songs as EventProgramSong[])
	const programSetlists = $derived(data.setlists as ProgramSetlist[])

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

	const monthGroupEvents = $derived(events.filter((e) => e.type !== 'indisponibilite'))

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
	let formProgram = $state<EventProgramSong[]>([])
	let submitting = $state(false)
	let formError = $state('')
	// Le formulaire d'ajout est replié derrière un bouton : on ouvre un jour bien plus
	// souvent pour voir qui vient que pour ajouter.
	let formOpen = $state(false)
	let formTypeSelect: HTMLSelectElement | undefined = $state()

	$effect(() => {
		if (formType === 'indisponibilite') {
			formTitle = ''
			formSessionId = ''
			formStart = ''
			formEnd = ''
			formProgram = []
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
		formProgram = []
		formError = ''
		editingEvent = null
		formDate = ''
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
					end_time: formStart ? formEnd || null : null,
					song_ids: formProgram.map((song) => song.id)
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
				formProgram = []
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

	// L'événement qu'on modifie, dans le formulaire d'ajout : mêmes champs, et rien n'est
	// appliqué avant « Enregistrer ».
	let editingEvent = $state<CalendarEventRow | null>(null)
	let formDate = $state('')
	let formHeading: HTMLElement | undefined = $state()

	// La date, le titre, le type, le lieu et les notes d'une session se changent sur sa fiche.
	const editingOwnFields = $derived(editingEvent === null || editingEvent.session_id === null)

	// Déplacer une date remet ses présences en cause : le dire avant d'enregistrer.
	const moveNotice = $derived.by(() => {
		if (!editingEvent || editingEvent.type === 'indisponibilite' || !formDate || formDate === editingEvent.date) return ''
		const answers = attendanceFor(editingEvent).members.filter((member) => member.response).length
		const erased = answers === 0 ? '' : answers === 1 ? 'La réponse déjà donnée sera effacée. ' : `Les ${answers} réponses déjà données seront effacées. `
		return `${erased}${formDate >= today ? 'Le groupe sera prévenu, et on lui redemandera qui vient.' : ''}`.trim()
	})

	// Une date passée n'a plus de travail à prévoir : on ne garde que le programme qu'elle a.
	const showProgramField = $derived(
		editingEvent === null || editingEvent.date >= today || (programs[editingEvent.id] ?? []).length > 0
	)

	function startEdit(event: CalendarEventRow) {
		editingEvent = event
		formDate = event.date
		formType = event.type
		formTitle = event.title ?? ''
		formNotes = event.notes ?? ''
		formLocation = event.location ?? ''
		formCoords =
			event.location_lat !== null && event.location_lon !== null
				? { lat: event.location_lat, lon: event.location_lon }
				: null
		formStart = event.start_time ?? ''
		formEnd = eventEndTime(event.start_time, event.duration_min) ?? ''
		formProgram = [...(programs[event.id] ?? [])]
		formError = ''
		formOpen = true
		// Le bouton cliqué vient de disparaître : le focus suit, et amène le formulaire à l'écran.
		tick().then(() => formHeading?.focus())
	}

	// L'événement dont on confirme les modifications.
	let pendingEdit = $state<CalendarEventRow | null>(null)

	/** Ce que l'enregistrement va changer, dans l'ordre du formulaire. */
	function changedFields(event: CalendarEventRow): string[] {
		const differs = (typed: string, saved: string | null) => typed.trim() !== (saved ?? '')
		const changes: string[] = []
		if (editingOwnFields) {
			if (formType !== event.type) changes.push('le type')
			if (formDate !== event.date) changes.push('la date')
			if (differs(formTitle, event.title)) changes.push('le titre')
		}
		if (event.type !== 'indisponibilite') {
			const savedEnd = eventEndTime(event.start_time, event.duration_min)
			if (differs(formStart, event.start_time) || (formStart && differs(formEnd, savedEnd))) changes.push('l’heure')
			const savedProgram = (programs[event.id] ?? []).map((song) => song.id).join()
			if (formProgram.map((song) => song.id).join() !== savedProgram) changes.push('le programme')
		}
		if (editingOwnFields) {
			const coordsDiffer = (formCoords?.lat ?? null) !== event.location_lat || (formCoords?.lon ?? null) !== event.location_lon
			if (differs(formLocation, event.location) || coordsDiffer) changes.push('le lieu')
			if (differs(formNotes, event.notes)) changes.push('les notes')
		}
		return changes
	}

	const editConfirmMessage = $derived.by(() => {
		if (!pendingEdit) return ''
		const label = pendingEdit.title || TYPE_LABELS[pendingEdit.type]
		const changes = new Intl.ListFormat('fr', { style: 'long', type: 'conjunction' }).format(changedFields(pendingEdit))
		return `À modifier pour « ${label} » : ${changes}. ${moveNotice}`.trim()
	})

	/** Rien de changé : rien à confirmer, le formulaire se referme comme sur « Annuler ». */
	function requestSave(event: CalendarEventRow) {
		if (changedFields(event).length === 0) openDayPanel(Number(event.date.slice(8)), false)
		else pendingEdit = event
	}

	function confirmEdit() {
		const event = pendingEdit
		pendingEdit = null
		if (event) saveEdit(event)
	}

	async function saveEdit(event: CalendarEventRow) {
		submitting = true
		formError = ''
		const location = formLocation.trim() || null
		const isGroupEvent = event.type !== 'indisponibilite'
		const newDate = editingOwnFields ? formDate : event.date
		try {
			const res = await fetch(`/api/agenda/${event.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					...(editingOwnFields && {
						date: formDate,
						notes: formNotes,
						location,
						location_coords: location ? formCoords : null
					}),
					...(editingOwnFields && isGroupEvent && { title: formTitle, type: formType }),
					...(isGroupEvent && {
						start_time: formStart || null,
						end_time: formStart ? formEnd || null : null,
						song_ids: formProgram.map((song) => song.id)
					})
				})
			})
			if (!res.ok) {
				formError = (await res.json().catch(() => ({}))).error ?? 'Modification non enregistrée.'
				return
			}
			// Le panneau suit l'événement à sa nouvelle date, au besoin dans un autre mois.
			openDayPanel(Number(newDate.slice(8)), false)
			if (newDate.slice(0, 7) === data.month) await invalidateAll()
			else await goto(`/agenda?date=${newDate}`, { noScroll: true })
		} catch {
			formError = 'Erreur réseau.'
		} finally {
			submitting = false
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

	function canEdit(event: CalendarEventRow) {
		return event.type !== 'indisponibilite' || event.user_id === userId
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

	function fmtShortDay(d: string) {
		return new Date(`${d}T00:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })
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

<main class="page page-wide agenda">
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

		<div class="day-panel" class:adding={formOpen} class:editing={editingEvent !== null} bind:this={dayPanel}>
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
							{@const program = programs[event.id] ?? []}
							{@const eventAttendance = attendanceFor(event)}
							<div class="event-card">
								<div class="event-head">
									<span class="event-badge session-type-{event.type} panel-event-type">
										{TYPE_LABELS[event.type]}
									</span>
									{#if event.title}<span class="panel-event-name">{event.title}</span>{/if}
									<div class="event-actions">
										{#if !formOpen}
											<button class="btn btn-ghost btn-sm" onclick={() => startEdit(event)}>Modifier</button>
										{/if}
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
								</div>
								<div class="event-details">
									{#if event.start_time}
										<span class="panel-event-time">
											<Icon name="clock" size="0.8rem" /> {formatEventTime(event.start_time, event.duration_min)}
										</span>
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
									{#if event.session_id && event.session_date}
										<a href="/sessions/{event.session_id}" class="panel-event-session">
											Session du {fmtDate(event.session_date)}{event.session_location ? ` — ${event.session_location}` : ''}
										</a>
									{:else}
										<a href={sessionCreateUrl(event)} class="panel-event-session panel-event-create">
											Créer la session →
										</a>
									{/if}
									<span class="panel-event-meta">par {event.author}</span>
								</div>
								{#if program.length > 0}
									<div class="event-section">
										<EventProgram songs={program} />
									</div>
								{/if}
								<!-- Date passée où rien n'a été demandé : le composant ne montrerait rien. -->
								{#if eventAttendance.requested || eventAttendance.members.some((m) => m.response) || event.date >= today}
									<div class="event-section">
										<EventAttendance
											attendance={eventAttendance}
											{userId}
											upcoming={event.date >= today}
											onchange={updateAttendance}
										/>
									</div>
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
								<div class="event-actions">
									{#if canEdit(event) && !formOpen}
										<button class="btn btn-ghost btn-sm" onclick={() => startEdit(event)}>Modifier</button>
									{/if}
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
							</div>
						{/each}
					</div>
				{/if}

				{#if dayGroupEvents.length === 0 && dayUnavails.length === 0}
					<p class="empty">Aucun événement ce jour.</p>
				{/if}
			</div>

			<div class="panel-form">
				{#if !formOpen}
					<button
						class="btn btn-secondary btn-sm form-toggle"
						onclick={() => { formOpen = true; tick().then(() => formTypeSelect?.focus()) }}
					>
						<Icon name="plus" /> Ajouter un événement
					</button>
				{:else}
				<div class="form-body">
					<h3 class="form-subtitle" tabindex="-1" bind:this={formHeading}>
						{#if !editingEvent}
							Ajouter un événement
						{:else if editingEvent.type === 'indisponibilite'}
							Modifier mon indisponibilité
						{:else}
							Modifier {editingEvent.title ? `« ${editingEvent.title} »` : 'l’événement'}
						{/if}
					</h3>

					{#if editingEvent === null || (editingOwnFields && editingEvent.type !== 'indisponibilite')}
						<div class="form-row">
							<select class="form-input" bind:value={formType} bind:this={formTypeSelect}>
								<!-- Une indisponibilité est personnelle, un événement au groupe : l'un ne devient pas l'autre. -->
								{#if !editingEvent}
									<option value="indisponibilite">Indisponible (personnel)</option>
								{/if}
								{#each SESSION_TYPES as value}
									<option {value}>{sessionTypeLabel(value)}</option>
								{/each}
							</select>
						</div>
					{/if}

					{#if editingEvent && editingOwnFields}
						<div class="form-row">
							<label class="time-field">
								<span>Date</span>
								<input class="form-input" type="date" bind:value={formDate} required />
							</label>
						</div>
						{#if moveNotice}<p class="form-hint">{moveNotice}</p>{/if}
					{/if}

					{#if formType !== 'indisponibilite'}
						{#if editingOwnFields}
							<div class="form-row">
								<input
									class="form-input"
									type="text"
									placeholder="Titre (optionnel)"
									bind:value={formTitle}
								/>
							</div>
						{/if}
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
						{#if !editingEvent}
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
						{#if showProgramField}
							<div class="form-row">
								<EventProgramField
									songs={programSongs}
									setlists={programSetlists}
									bind:value={formProgram}
									placeholder="Programme : ajouter un morceau (optionnel)"
								/>
							</div>
						{/if}
					{/if}

					{#if editingOwnFields}
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
					{:else if editingEvent?.session_id}
						<p class="form-hint">
							La date, le titre, le type, le lieu et les notes se modifient sur
							<a href="/sessions/{editingEvent.session_id}">la session</a>.
						</p>
					{/if}

					{#if formError}
						<p class="message-error">{formError}</p>
					{/if}

					<div class="form-actions">
						{#if editingEvent}
							{@const target = editingEvent}
							<button class="btn btn-primary btn-sm" onclick={() => requestSave(target)} disabled={submitting || !formDate}>
								Enregistrer
							</button>
						{:else}
							<button class="btn btn-primary btn-sm" onclick={addEvent} disabled={submitting}>
								Ajouter
							</button>
						{/if}
						<button class="btn btn-secondary btn-sm" onclick={() => openDayPanel(selectedDay!, false)}>
							Annuler
						</button>
					</div>
				</div>
				{/if}
			</div>
		</div>
	{:else}
		<!-- Colonne de droite au repos, sur grand écran : sans jour choisi, les dates du mois. -->
		<div class="month-overview">
			<h2 class="panel-title">Dates du mois</h2>
			{#if monthGroupEvents.length > 0}
				<ul class="overview-list">
					{#each monthGroupEvents as event (event.id)}
						<li>
							<button class="overview-row" onclick={() => selectDay(Number(event.date.slice(8)))}>
								<span class="overview-date">{fmtShortDay(event.date)}</span>
								<span class="event-badge session-type-{event.type}">{TYPE_LABELS[event.type]}</span>
								{#if event.title}<span class="overview-title">{event.title}</span>{/if}
								{#if event.start_time}<span class="overview-time">{event.start_time}</span>{/if}
							</button>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="empty">Aucune date ce mois-ci.</p>
			{/if}
			<p class="overview-hint">Choisis un jour pour voir son détail ou y ajouter un événement.</p>
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

	<ConfirmDialog
		open={pendingEdit !== null}
		level={moveNotice ? 'warning' : 'info'}
		title="Enregistrer les modifications ?"
		message={editConfirmMessage}
		confirmLabel="Enregistrer"
		onConfirm={confirmEdit}
		onCancel={() => (pendingEdit = null)}
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
		/* `minmax(0, …)` : sinon un titre long, qui ne passe pas à la ligne, élargit sa colonne
		   et pousse les jours suivants hors de la grille. */
		grid-template-columns: repeat(7, minmax(0, 1fr));
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

	.panel-event-time :global(.icon) { vertical-align: -1px; }

	.badge-time {
		font-weight: 700;
		margin-right: 0.2rem;
	}

	.time-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}

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

	/* Une fiche par événement : l'en-tête, ses détails, puis programme et présences,
	   chacun sa section. Toute la largeur va au contenu, le badge reste dans l'en-tête. */
	.event-card {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.event-card + .event-card {
		padding-top: 0.75rem;
		border-top: 1px solid var(--color-border);
	}

	.event-head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
	}

	.event-head .panel-event-type { margin-top: 0; }

	.event-head .panel-event-name {
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.event-actions {
		margin-left: auto;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: 0.15rem;
	}

	.event-details {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.event-section {
		padding-top: 0.5rem;
		border-top: 1px solid var(--color-border-light);
	}

	.event-section :global(.event-attendance) { margin-top: 0; }

	/* À toutes les largeurs : sous la grille, le formulaire serait sinon sous les fiches. */
	.day-panel.editing .panel-events { display: none; }
	.day-panel.editing .panel-form { border-top: none; }

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

	.form-toggle { align-self: flex-start; }

	/* Les dates du mois n'occupent que la colonne de droite d'un grand écran. */
	.month-overview { display: none; }

	/* Le mois et le détail du jour côte à côte, dès que la grille garde des cases lisibles à
	   côté de la colonne (fenêtre moins les 188 px de la barre latérale). Le mois ne bouge
	   plus quand on change de jour, et la colonne reste à l'écran, défilant sur elle-même. */
	@media (min-width: 1200px) {
		.agenda {
			--side-top: calc(var(--top-bar-h) + var(--banners-h, 0px) + 1rem);
			--side-h: calc(100dvh - var(--side-top) - var(--mini-player-h) - 1rem);
			max-width: var(--page-split);
			display: grid;
			grid-template-columns: minmax(0, 1fr) 380px;
			/* Une colonne plus haute que le mois ne doit pas faire descendre sa grille : seule
			   la rangée de celle-ci absorbe l'écart. */
			grid-template-rows: auto 1fr;
			column-gap: 1.5rem;
			align-items: start;
		}

		.header,
		.calendar { grid-column: 1; }

		.day-panel,
		.month-overview {
			grid-column: 2;
			grid-row: 1 / span 2;
			position: sticky;
			top: var(--side-top);
			max-height: var(--side-h);
		}

		.day-panel {
			margin-top: 0;
			display: flex;
			flex-direction: column;
		}

		.panel-events {
			flex: 1;
			min-height: 0;
			overflow-y: auto;
		}

		/* La colonne ne montre qu'une chose à la fois : le jour, ou le formulaire d'ajout,
		   sur toute sa hauteur — les suggestions du lieu ont ainsi la place de s'ouvrir. */
		.day-panel.adding { height: var(--side-h); }
		.day-panel.adding .panel-events { display: none; }

		.day-panel.adding .panel-form {
			flex: 1;
			min-height: 0;
			overflow-y: auto;
			border-top: none;
		}

		.month-overview {
			display: flex;
			flex-direction: column;
			gap: 0.6rem;
			overflow-y: auto;
			padding: 0.65rem 1rem;
			border: 1px solid var(--color-border);
			border-radius: var(--radius-xl);
		}
	}

	.month-overview .panel-title { text-transform: none; }

	.overview-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}

	.overview-row {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.35rem 0.4rem;
		border: none;
		border-radius: var(--radius-md);
		background: none;
		color: inherit;
		font: inherit;
		font-size: var(--text-sm);
		text-align: left;
		cursor: pointer;
	}

	.overview-row:hover { background: var(--color-bg-subtle); }

	.overview-row .event-badge { flex-shrink: 0; }

	.overview-date {
		flex-shrink: 0;
		width: 3.6rem;
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--color-text-secondary);
	}

	.overview-title {
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.overview-time {
		margin-left: auto;
		flex-shrink: 0;
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
	}

	.overview-hint {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--color-text-muted);
	}

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

		/* Au doigt : les mêmes 40 px que la navigation de semaine. */
		.panel-header .btn,
		.event-actions .btn,
		.form-actions .btn,
		.form-toggle { min-height: 40px; }

		.panel-header .btn,
		.delete-btn { min-width: 40px; }

		/* Type et commandes sur une rangée, le titre dessous : entre les deux, il n'aurait
		   plus que quelques mots par ligne. */
		.event-head { flex-wrap: wrap; }
		.event-head .panel-event-name { order: 1; flex-basis: 100%; }
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

	.form-hint {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
	}

	.form-hint a { color: inherit; }

	.form-row {
		display: flex;
	}

	/* Rendu par LocationInput : le style scopé ne l'atteint qu'avec `:global`. */
	.form-row > :global(.location) { flex: 1; min-width: 0; }
	.form-row > :global(.location .form-input) { width: 100%; }

	.form-row .form-input {
		flex: 1;
		/* Un <select> vaut sinon la largeur de sa plus longue option, plus que la colonne. */
		min-width: 0;
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
