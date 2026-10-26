<script lang="ts">
	// Présences d'un événement de groupe, dans le panneau du jour de l'agenda : sa propre
	// réponse (et un mot), qui vient, qui n'a pas répondu, et la relance.
	import AttendanceButtons from './AttendanceButtons.svelte'
	import {
		ATTENDANCE_LABELS,
		ATTENDANCE_NOTE_MAX,
		summarizeAttendance,
		type EventAttendance
	} from '$lib/attendance'

	let {
		attendance,
		userId,
		upcoming,
		onchange
	}: {
		attendance: EventAttendance
		userId: number
		/** Date du jour ou à venir : on peut encore poser la question ou relancer. */
		upcoming: boolean
		onchange: (attendance: EventAttendance) => void
	} = $props()

	const me = $derived(attendance.members.find((m) => m.user_id === userId) ?? null)
	const others = $derived(attendance.members.filter((m) => m.user_id !== userId))
	// Celui qui relance ne se notifie pas : il n'entre pas dans le compte.
	const toRemind = $derived(others.filter((m) => !m.response).length)
	const hasAnswers = $derived(attendance.members.some((m) => m.response))

	let note = $derived(me?.note ?? '')
	let noteSaving = $state(false)
	let reminding = $state(false)
	let message = $state<string | null>(null)
	let error = $state<string | null>(null)

	async function saveNote() {
		if (!me?.response || note.trim() === (me.note ?? '')) return
		noteSaving = true
		error = null
		try {
			const res = await fetch(`/api/agenda/${attendance.event_id}/attendance`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ response: me.response, note: note.trim() })
			})
			const body = await res.json().catch(() => ({}))
			if (!res.ok) error = body.error ?? 'Note non enregistrée.'
			else onchange(body.attendance)
		} catch {
			error = 'Erreur réseau.'
		} finally {
			noteSaving = false
		}
	}

	async function remind() {
		reminding = true
		error = null
		message = null
		try {
			const res = await fetch(`/api/agenda/${attendance.event_id}/attendance/remind`, { method: 'POST' })
			const body = await res.json().catch(() => ({}))
			if (!res.ok) {
				error = body.error ?? 'Relance impossible.'
				return
			}
			message = body.reminded > 0
				? `${body.reminded} membre${body.reminded > 1 ? 's' : ''} prévenu${body.reminded > 1 ? 's' : ''}.`
				: 'Tout le monde a déjà répondu.'
			onchange(body.attendance)
		} catch {
			error = 'Erreur réseau.'
		} finally {
			reminding = false
		}
	}
</script>

<div class="event-attendance">
	{#if attendance.requested || hasAnswers}
		<div class="attendance-head">
			<span class="attendance-title">Présences</span>
			<span class="attendance-summary">{summarizeAttendance(attendance.members)}</span>
		</div>

		{#if attendance.open && me}
			<div class="attendance-me">
				<AttendanceButtons
					eventId={attendance.event_id}
					value={me.response}
					onanswer={(_, updated) => onchange(updated)}
				/>
				{#if me.unavailable && !me.response}
					<span class="attendance-hint">Tu as noté une indisponibilité ce jour-là.</span>
				{/if}
			</div>
			{#if me.response}
				<input
					class="form-input attendance-note"
					type="text"
					placeholder="Un mot ? (« j'arrive à 20 h »)"
					maxlength={ATTENDANCE_NOTE_MAX}
					bind:value={note}
					disabled={noteSaving}
					onchange={saveNote}
					onkeydown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur() }}
					aria-label="Un mot sur ta présence"
				/>
			{/if}
		{/if}

		<ul class="attendance-list">
			{#each attendance.members as member (member.user_id)}
				<li>
					<span class="attendance-name">{member.user_id === userId ? 'Toi' : member.name}</span>
					{#if member.response}
						<span class="attendance-chip attendance-{member.response}">{ATTENDANCE_LABELS[member.response]}</span>
					{:else}
						<span class="attendance-chip attendance-pending">Sans réponse</span>
					{/if}
					{#if member.unavailable}
						<span class="attendance-unavailable">indisponible ce jour-là</span>
					{/if}
					{#if member.note}<span class="attendance-member-note">{member.note}</span>{/if}
				</li>
			{/each}
		</ul>
	{/if}

	{#if upcoming && (!attendance.requested || toRemind > 0)}
		<button type="button" class="btn-link attendance-remind" onclick={remind} disabled={reminding}>
			{#if !attendance.requested}
				Demander les présences
			{:else}
				Relancer {toRemind > 1 ? `les ${toRemind} membres sans réponse` : 'le membre sans réponse'}
			{/if}
		</button>
	{/if}
	{#if message}<p class="attendance-message" role="status">{message}</p>{/if}
	{#if error}<p class="message-error" role="alert">{error}</p>{/if}
</div>

<style>
	.event-attendance {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		margin-top: 0.4rem;
	}

	.attendance-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.5rem;
	}

	.attendance-title {
		font-size: var(--text-xs);
		font-weight: 700;
	}

	.attendance-summary,
	.attendance-hint,
	.attendance-message {
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
	}

	.attendance-message { margin: 0; }

	.attendance-me {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}

	.attendance-note {
		max-width: 22rem;
		font-size: var(--text-xs);
	}

	.attendance-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.attendance-list li {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.4rem;
		font-size: var(--text-xs);
	}

	.attendance-name { font-weight: 600; }

	.attendance-chip {
		padding: 0 0.4rem;
		border-radius: var(--radius-pill);
		font-size: var(--text-2xs);
		font-weight: 600;
	}

	.attendance-present { background: var(--color-success-bg); color: var(--color-success-text); }
	.attendance-maybe { background: var(--color-warning-bg); color: var(--color-warning-text); }
	.attendance-absent { background: var(--color-red-light); color: var(--color-red-dark); }
	.attendance-pending { background: var(--color-chip-bg); color: var(--color-text-secondary); }

	.attendance-unavailable { color: var(--color-red-dark); }

	.attendance-member-note {
		flex-basis: 100%;
		color: var(--color-text-secondary);
		font-style: italic;
	}

	.attendance-remind {
		align-self: flex-start;
		font-size: var(--text-xs);
	}
</style>
