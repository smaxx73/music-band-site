<script lang="ts">
	// « Tu viens ? » : Présent / Peut-être / Absent, sur un événement de groupe.
	// Le même trio partout où la question se pose — cloche, tableau de bord, agenda —,
	// pour qu'une réponse se donne d'un geste là où on la voit.
	import {
		ATTENDANCE_LABELS,
		ATTENDANCE_RESPONSES,
		type AttendanceResponse,
		type EventAttendance
	} from '$lib/attendance'

	let {
		eventId,
		value = null,
		label = 'Ta présence',
		stretch = false,
		onanswer
	}: {
		eventId: number
		value?: AttendanceResponse | null
		/** Intitulé du groupe de boutons, pour les lecteurs d'écran. */
		label?: string
		/** Toute la largeur, boutons égaux : dans une colonne étroite. */
		stretch?: boolean
		onanswer?: (response: AttendanceResponse, attendance: EventAttendance) => void
	} = $props()

	// Suit la réponse reçue, et la devance le temps de l'envoi.
	let current = $derived(value)
	let sending = $state(false)
	let error = $state<string | null>(null)

	async function answer(response: AttendanceResponse) {
		if (sending || response === current) return
		const previous = current
		current = response
		sending = true
		error = null
		try {
			const res = await fetch(`/api/agenda/${eventId}/attendance`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ response })
			})
			const body = await res.json().catch(() => ({}))
			if (!res.ok) {
				current = previous
				error = body.error ?? 'Réponse non enregistrée.'
				return
			}
			onanswer?.(response, body.attendance as EventAttendance)
		} catch {
			current = previous
			error = 'Erreur réseau.'
		} finally {
			sending = false
		}
	}
</script>

<div class="attendance" class:stretch>
	<div class="attendance-buttons" role="group" aria-label={label}>
		{#each ATTENDANCE_RESPONSES as response (response)}
			<button
				type="button"
				class="attendance-{response}"
				aria-pressed={current === response}
				disabled={sending}
				onclick={() => answer(response)}
			>{ATTENDANCE_LABELS[response]}</button>
		{/each}
	</div>
	{#if error}<p class="attendance-error" role="alert">{error}</p>{/if}
</div>

<style>
	.attendance-buttons {
		display: inline-flex;
		border: 1px solid var(--color-border-light);
		border-radius: var(--radius-pill);
		overflow: hidden;
		background: var(--color-bg);
	}

	.stretch .attendance-buttons { display: flex; }
	.stretch button { flex: 1; }

	button {
		min-height: 30px;
		padding: 0.2rem 0.6rem;
		white-space: nowrap;
		border: none;
		background: none;
		font: inherit;
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--color-text-secondary);
		cursor: pointer;
	}

	button + button { border-left: 1px solid var(--color-border-light); }
	button:hover:not(:disabled) { background: var(--color-bg-muted); }
	button:disabled { cursor: progress; }

	.attendance-present[aria-pressed='true'] {
		background: var(--color-success-bg);
		color: var(--color-success-text);
	}

	.attendance-maybe[aria-pressed='true'] {
		background: var(--color-warning-bg);
		color: var(--color-warning-text);
	}

	.attendance-absent[aria-pressed='true'] {
		background: var(--color-red-light);
		color: var(--color-red-dark);
	}

	.attendance-error {
		margin: 0.25rem 0 0;
		font-size: var(--text-xs);
		color: var(--color-error);
	}

	/* Au doigt, une cible de 30 px se rate. */
	@media (max-width: 640px) {
		button { min-height: 38px; }
	}
</style>
