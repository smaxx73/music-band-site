// Présences à un événement de groupe : la question « tu viens ? » et ses réponses.
// Partagé entre l'écran et le serveur — voir src/lib/server/attendance.ts.

export const ATTENDANCE_RESPONSES = ['present', 'maybe', 'absent'] as const
export type AttendanceResponse = (typeof ATTENDANCE_RESPONSES)[number]

export const ATTENDANCE_LABELS: Record<AttendanceResponse, string> = {
	present: 'Présent',
	maybe: 'Peut-être',
	absent: 'Absent'
}

export function isAttendanceResponse(value: unknown): value is AttendanceResponse {
	return typeof value === 'string' && (ATTENDANCE_RESPONSES as readonly string[]).includes(value)
}

/** Note d'une réponse (« j'arrive à 20 h ») : une phrase, pas un commentaire. */
export const ATTENDANCE_NOTE_MAX = 140

/**
 * Un membre du groupe face à un événement. `unavailable` : il a posé une indisponibilité
 * ce jour-là. Elle ne répond pas à sa place — elle vaut pour la journée et tous ses
 * groupes, la réponse pour cet événement seul —, mais elle se signale à côté de lui.
 */
export type AttendanceMember = {
	user_id: number
	name: string
	response: AttendanceResponse | null
	note: string | null
	unavailable: boolean
}

export type EventAttendance = {
	event_id: number
	/** La question a été posée au groupe (`calendar_events.attendance_requested`). */
	requested: boolean
	/** On peut encore y répondre : question posée, date du jour ou à venir. */
	open: boolean
	members: AttendanceMember[]
}

export type AttendanceCounts = Record<AttendanceResponse, number> & { pending: number }

export function countAttendance(members: AttendanceMember[]): AttendanceCounts {
	const counts: AttendanceCounts = { present: 0, maybe: 0, absent: 0, pending: 0 }
	for (const member of members) counts[member.response ?? 'pending']++
	return counts
}

/** « 3 présents · 1 peut-être · 2 sans réponse », sans les zéros. */
export function summarizeAttendance(members: AttendanceMember[]): string {
	const counts = countAttendance(members)
	const parts: string[] = []
	if (counts.present) parts.push(`${counts.present} présent${counts.present > 1 ? 's' : ''}`)
	if (counts.maybe) parts.push(`${counts.maybe} peut-être`)
	if (counts.absent) parts.push(`${counts.absent} absent${counts.absent > 1 ? 's' : ''}`)
	if (counts.pending) parts.push(`${counts.pending} sans réponse`)
	return parts.join(' · ')
}
