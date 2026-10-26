// Heure et durée d'un événement d'agenda (`calendar_events.start_time`, `duration_min`).
// Partagé entre l'écran (saisie, affichage) et le serveur (validation).
//
// On saisit une heure de fin, parce que c'est ainsi qu'on parle d'une répétition
// (« 19:30 – 22:00 ») ; on stocke une durée, pour qu'une fin après minuit ne soit pas
// un cas particulier.

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

function toMinutes(time: string): number {
	const [h, m] = time.split(':').map(Number)
	return h * 60 + m
}

function fromMinutes(total: number): string {
	const day = ((total % 1440) + 1440) % 1440
	return `${String(Math.floor(day / 60)).padStart(2, '0')}:${String(day % 60).padStart(2, '0')}`
}

function readTime(value: unknown): string | null | undefined {
	if (value === undefined || value === null || value === '') return null
	if (typeof value !== 'string') return undefined
	// Un <input type="time"> peut envoyer les secondes.
	const time = value.slice(0, 5)
	return TIME_RE.test(time) ? time : undefined
}

/**
 * Heure de début et de fin saisies (« HH:MM », vide = aucune) → colonnes en base.
 * `null` si la saisie est invalide : heure mal formée, ou fin sans début.
 * Une fin égale ou antérieure au début passe minuit.
 */
export function parseEventTime(
	start: unknown,
	end: unknown
): { start_time: string | null; duration_min: number | null } | null {
	const startTime = readTime(start)
	const endTime = readTime(end)
	if (startTime === undefined || endTime === undefined) return null
	if (!startTime) return endTime ? null : { start_time: null, duration_min: null }
	if (!endTime) return { start_time: startTime, duration_min: null }
	const diff = toMinutes(endTime) - toMinutes(startTime)
	return { start_time: startTime, duration_min: diff > 0 ? diff : diff + 1440 }
}

/** Heure de fin (« HH:MM ») d'un événement qui a un début et une durée. */
export function eventEndTime(startTime: string | null, durationMin: number | null): string | null {
	if (!startTime || !durationMin) return null
	return fromMinutes(toMinutes(startTime.slice(0, 5)) + durationMin)
}

/** « 19:30 – 22:00 », « 19:30 », ou null sans heure. */
export function formatEventTime(startTime: string | null, durationMin: number | null): string | null {
	if (!startTime) return null
	const end = eventEndTime(startTime, durationMin)
	return end ? `${startTime.slice(0, 5)} – ${end}` : startTime.slice(0, 5)
}
