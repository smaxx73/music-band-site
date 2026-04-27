<script lang="ts">
	import type { PageData } from './$types'
	import { goto, invalidateAll } from '$app/navigation'

	let { data }: { data: PageData } = $props()

	type CalendarEventRow = {
		id: number
		date: string
		type: 'indisponibilite' | 'repetition' | 'concert'
		author: string
		title: string | null
		notes: string | null
		session_id: number | null
		session_date: string | null
		session_location: string | null
	}

	type SessionRow = {
		id: number
		date: string
		location: string | null
	}

	const events = $derived(data.events as unknown as CalendarEventRow[])
	const sessions = $derived(data.sessions as unknown as SessionRow[])
	const userName = $derived(data.userName as string)

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

	const today = new Date().toISOString().slice(0, 10)

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
		goto(`/agenda?month=${y}-${String(m).padStart(2, '0')}`)
	}

	function nextMonth() {
		let y = calYear,
			m = calMonth + 1
		if (m > 12) {
			y++
			m = 1
		}
		goto(`/agenda?month=${y}-${String(m).padStart(2, '0')}`)
	}

	function goToday() {
		const now = new Date()
		goto(`/agenda?month=${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
	}

	// Form state
	let selectedDay: number | null = $state(null)
	let formType: 'indisponibilite' | 'repetition' | 'concert' = $state('indisponibilite')
	let formTitle = $state('')
	let formNotes = $state('')
	let formSessionId = $state('')
	let submitting = $state(false)
	let formError = $state('')

	$effect(() => {
		if (formType === 'indisponibilite') {
			formTitle = ''
			formSessionId = ''
		}
	})

	function selectDay(day: number) {
		if (selectedDay === day) {
			selectedDay = null
		} else {
			selectedDay = day
			formType = 'indisponibilite'
			formTitle = ''
			formNotes = ''
			formSessionId = ''
			formError = ''
		}
	}

	async function addEvent() {
		if (!selectedDay) return
		submitting = true
		formError = ''
		try {
			const res = await fetch('/api/agenda', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					date: dateStr(selectedDay),
					type: formType,
					title: formTitle || null,
					notes: formNotes || null,
					session_id: formSessionId ? parseInt(formSessionId) : null
				})
			})
			if (!res.ok) {
				const d = await res.json()
				formError = d.error || "Erreur lors de l'ajout."
			} else {
				formTitle = ''
				formNotes = ''
				formSessionId = ''
				await invalidateAll()
			}
		} catch {
			formError = 'Erreur réseau.'
		} finally {
			submitting = false
		}
	}

	async function deleteEvent(id: number) {
		const res = await fetch(`/api/agenda/${id}`, { method: 'DELETE' })
		if (res.ok) await invalidateAll()
	}

	function canDelete(event: CalendarEventRow) {
		if (event.type === 'indisponibilite') return event.author === userName
		return true
	}

	const TYPE_LABELS: Record<string, string> = {
		indisponibilite: 'Indisponible',
		repetition: 'Répétition',
		concert: 'Concert'
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
</script>

<svelte:head>
	<title>Agenda</title>
</svelte:head>

<main>
	<div class="header">
		<button class="btn btn-ghost nav-arrow" onclick={prevMonth}>←</button>
		<h1 class="month-title">{monthLabel}</h1>
		<button class="btn btn-ghost nav-arrow" onclick={nextMonth}>→</button>
		{#if !isCurrentMonth}
			<button class="btn btn-secondary btn-sm" onclick={goToday}>Aujourd'hui</button>
		{/if}
	</div>

	<div class="calendar">
		{#each ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'] as dow}
			<div class="dow-header">{dow}</div>
		{/each}

		{#each calDays as day}
			<div
				class="day-cell"
				class:day-empty={day === null}
				class:day-today={day !== null && dateStr(day) === today}
				class:day-selected={day !== null && selectedDay === day}
			>
				{#if day !== null}
					<button class="day-number" onclick={() => selectDay(day)}>{day}</button>
					<div class="day-events">
						{#each eventsForDay(day) as event}
							<div class="event-badge event-{event.type}">
								{event.type === 'indisponibilite'
									? event.author
									: (event.title || TYPE_LABELS[event.type])}
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/each}
	</div>

	{#if selectedDay !== null}
		<div class="day-panel">
			<div class="panel-header">
				<h2 class="panel-title">{selectedDayLabel}</h2>
				<button class="btn btn-ghost btn-sm" onclick={() => (selectedDay = null)}>✕</button>
			</div>

			<div class="panel-events">
				{#each eventsForDay(selectedDay) as event}
					<div class="panel-event">
						<span class="event-badge event-{event.type} panel-event-type">
							{TYPE_LABELS[event.type]}
						</span>
						<div class="panel-event-body">
							{#if event.type === 'indisponibilite'}
								<span class="panel-event-name">{event.author}</span>
							{:else}
								<span class="panel-event-name">{event.title || TYPE_LABELS[event.type]}</span>
								{#if event.session_id && event.session_date}
									<a href="/sessions/{event.session_id}" class="panel-event-session">
										Session du {fmtDate(event.session_date)}{event.session_location ? ` — ${event.session_location}` : ''}
									</a>
								{/if}
							{/if}
							{#if event.notes}
								<span class="panel-event-notes">{event.notes}</span>
							{/if}
							<span class="panel-event-meta">par {event.author}</span>
						</div>
						{#if canDelete(event)}
							<button
								class="btn btn-ghost btn-sm delete-btn"
								onclick={() => deleteEvent(event.id)}
								title="Supprimer"
							>✕</button>
						{/if}
					</div>
				{:else}
					<p class="empty">Aucun événement ce jour.</p>
				{/each}
			</div>

			<div class="panel-form">
				<h3 class="form-subtitle">Ajouter un événement</h3>

				<div class="form-row">
					<select class="form-input" bind:value={formType}>
						<option value="indisponibilite">Indisponible</option>
						<option value="repetition">Répétition</option>
						<option value="concert">Concert</option>
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
	{/if}
</main>

<style>
	main {
		max-width: 960px;
		margin: 2rem auto;
		padding: 0 1rem;
	}

	.header {
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

	.day-cell:nth-child(7n + 1) {
		/* Monday column — no special style */
	}

	/* Remove right border on last column */
	.day-cell:nth-child(7n) {
		border-right: none;
	}

	.day-empty {
		background: var(--color-bg-subtle);
	}

	.day-selected {
		background: #f0f4ff;
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

	.day-number:hover {
		background: var(--color-bg-muted);
	}

	.day-events {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin-top: 3px;
	}

	.event-badge {
		font-size: 0.68rem;
		padding: 1px 4px;
		border-radius: 3px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 100%;
		display: block;
	}

	.event-indisponibilite {
		background: #fecdd3;
		color: #be123c;
	}

	.event-repetition {
		background: var(--color-learning-bg);
		color: var(--color-learning-text);
	}

	.event-concert {
		background: var(--color-repertoire-bg);
		color: var(--color-repertoire-text);
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
		gap: 0.6rem;
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

		.month-title {
			font-size: var(--text-base);
		}
	}
</style>
