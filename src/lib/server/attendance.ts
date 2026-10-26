import sql from './db'
import { notifyGroup } from './notifications'
import { formatDateOnly } from '$lib/date'
import { sessionTypeLabel } from '$lib/types'
import { formatEventTime } from '$lib/event-time'
import type { AttendanceMember, AttendanceResponse, EventAttendance } from '$lib/attendance'

// Présences à un événement de groupe. La question est portée par l'événement d'agenda,
// jamais par la session : toute session a le sien, et un événement transformé en session
// garde sa ligne — ses réponses avec.
//
// - Une date à venir pose la question à sa création (`attendance_requested`), et chaque
//   membre est notifié (`attendance`, non désactivable : elle attend une réponse).
// - Tant qu'elle a cours — question posée, date du jour ou à venir —, on répond, on change
//   d'avis, on relance ceux qui n'ont pas répondu.
// - La date change : les réponses ne valent plus, la question est reposée.
//
// Une indisponibilité ne répond pas à la place du membre : elle vaut pour la journée et
// tous ses groupes. Elle se signale seulement à côté de lui.

// Type des éléments passé à sql.array, comme dans notifications.ts.
const INT4_OID = 23

type Actor = { id: number; display_name: string }

type EventRow = {
	id: number
	group_id: number
	date: string
	type: string
	title: string | null
	location: string | null
	start_time: string | null
	duration_min: number | null
	attendance_requested: boolean
	/** Date du jour ou à venir, au jour de la base comme `CURRENT_DATE` partout ailleurs. */
	upcoming: boolean
	open: boolean
}

export type AttendanceResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string }

export type PendingAttendance = {
	event_id: number
	session_id: number | null
	date: string
	type: string
	title: string | null
	location: string | null
	start_time: string | null
	duration_min: number | null
}

async function findGroupEvent(eventId: number, groupId: number): Promise<EventRow | null> {
	const [event] = await sql<EventRow[]>`
		SELECT
			e.id, e.group_id, e.date::text AS date, e.type, e.title, e.location,
			to_char(e.start_time, 'HH24:MI') AS start_time, e.duration_min, e.attendance_requested,
			(e.date >= CURRENT_DATE) AS upcoming,
			(e.attendance_requested AND e.date >= CURRENT_DATE) AS open
		FROM calendar_events e
		WHERE e.id = ${eventId} AND e.group_id = ${groupId} AND e.type <> 'indisponibilite'
	`
	return event ?? null
}

/** « jeudi 12 novembre · 19:30 – 22:00 · Chez Élise » : ce qu'il faut pour répondre. */
function attendanceExcerpt(event: EventRow): string {
	return [
		formatDateOnly(event.date, { weekday: 'long', day: 'numeric', month: 'long' }),
		formatEventTime(event.start_time, event.duration_min),
		event.location
	]
		.filter(Boolean)
		.join(' · ')
}

function notifyAttendance(event: EventRow, actor: Actor, excludeUserIds: number[] = []) {
	return notifyGroup(
		{
			groupId: event.group_id,
			actor,
			type: 'attendance',
			subject: event.title ?? sessionTypeLabel(event.type),
			excerpt: attendanceExcerpt(event),
			link: `/agenda?date=${event.date}`,
			eventId: event.id
		},
		excludeUserIds
	)
}

/**
 * Notifie le groupe d'une question qui vient d'être posée — l'appelant a écrit
 * `attendance_requested` à la création. Remplace la notification générique de la
 * création (session, agenda) : elle annonce la même date, et demande en plus.
 */
export async function askAttendance(eventId: number, groupId: number, actor: Actor): Promise<void> {
	const event = await findGroupEvent(eventId, groupId)
	if (event?.attendance_requested) await notifyAttendance(event, actor)
}

/**
 * La date de l'événement a changé : les réponses données pour l'ancienne ne valent plus,
 * ni les notifications qui la demandaient. La question est reposée si la nouvelle date
 * est à venir. Retourne vrai si elle l'a été — le groupe vient alors d'être notifié.
 */
export async function restartAttendance(eventId: number, groupId: number, actor: Actor): Promise<boolean> {
	await sql`DELETE FROM event_attendance WHERE event_id = ${eventId}`
	await sql`DELETE FROM notifications WHERE event_id = ${eventId} AND type = 'attendance'`
	const [row] = await sql<{ attendance_requested: boolean }[]>`
		UPDATE calendar_events SET attendance_requested = (date > CURRENT_DATE)
		WHERE id = ${eventId} AND group_id = ${groupId}
		RETURNING attendance_requested
	`
	if (!row?.attendance_requested) return false
	await askAttendance(eventId, groupId, actor)
	return true
}

/** Réponses et membres du groupe, événement par événement. Les membres actifs seulement. */
export async function listAttendance(groupId: number, eventIds: number[]): Promise<Map<number, EventAttendance>> {
	const result = new Map<number, EventAttendance>()
	if (eventIds.length === 0) return result

	const rows = await sql<
		(AttendanceMember & { event_id: number; requested: boolean; open: boolean })[]
	>`
		SELECT
			e.id AS event_id, e.attendance_requested AS requested,
			(e.attendance_requested AND e.date >= CURRENT_DATE) AS open,
			u.id AS user_id, u.display_name AS name, a.response, a.note,
			EXISTS (
				SELECT 1 FROM calendar_events i
				WHERE i.type = 'indisponibilite' AND i.user_id = u.id AND i.date = e.date
			) AS unavailable
		FROM calendar_events e
		JOIN user_groups ug ON ug.group_id = e.group_id
		JOIN users u ON u.id = ug.user_id AND u.active
		LEFT JOIN event_attendance a ON a.event_id = e.id AND a.user_id = u.id
		WHERE e.id = ANY(${sql.array(eventIds, INT4_OID)}) AND e.group_id = ${groupId}
		ORDER BY e.id, lower(u.display_name)
	`
	for (const row of rows) {
		let entry = result.get(row.event_id)
		if (!entry) {
			entry = { event_id: row.event_id, requested: row.requested, open: row.open, members: [] }
			result.set(row.event_id, entry)
		}
		entry.members.push({
			user_id: row.user_id,
			name: row.name,
			response: row.response,
			note: row.note,
			unavailable: row.unavailable
		})
	}
	return result
}

async function attendanceOf(eventId: number, groupId: number): Promise<EventAttendance> {
	return (
		(await listAttendance(groupId, [eventId])).get(eventId) ?? {
			event_id: eventId,
			requested: false,
			open: false,
			members: []
		}
	)
}

/**
 * Répond (ou change d'avis). `note` absent garde la note déjà écrite ; vide l'efface.
 * Les demandes de présence de cet événement sont marquées lues : on y a répondu.
 */
export async function setAttendance(
	eventId: number,
	groupId: number,
	userId: number,
	response: AttendanceResponse,
	note: string | null | undefined
): Promise<AttendanceResult<EventAttendance>> {
	const event = await findGroupEvent(eventId, groupId)
	if (!event) return { ok: false, status: 404, error: 'Événement introuvable.' }
	if (!event.attendance_requested) {
		return { ok: false, status: 409, error: 'Les présences ne sont pas demandées pour cet événement.' }
	}
	if (!event.open) return { ok: false, status: 409, error: 'Cette date est passée.' }

	const keepNote = note === undefined
	await sql`
		INSERT INTO event_attendance (event_id, user_id, response, note)
		VALUES (${eventId}, ${userId}, ${response}, ${note ?? null})
		ON CONFLICT (event_id, user_id) DO UPDATE SET
			response = EXCLUDED.response,
			note = CASE WHEN ${keepNote} THEN event_attendance.note ELSE EXCLUDED.note END,
			answered_at = now()
	`
	await sql`
		UPDATE notifications SET read_at = now()
		WHERE event_id = ${eventId} AND user_id = ${userId} AND type = 'attendance' AND read_at IS NULL
	`
	return { ok: true, value: await attendanceOf(eventId, groupId) }
}

/**
 * Relance ceux qui n'ont pas répondu — ou pose la question pour la première fois sur un
 * événement qui ne l'avait pas encore (créé le jour même, par exemple). Une seule demande
 * par membre dans la cloche : la précédente est remplacée. L'auteur de la relance ne se
 * notifie pas, comme partout. Retourne le nombre de membres relancés.
 */
export async function remindAttendance(
	eventId: number,
	groupId: number,
	actor: Actor
): Promise<AttendanceResult<{ reminded: number; attendance: EventAttendance }>> {
	let event = await findGroupEvent(eventId, groupId)
	if (!event) return { ok: false, status: 404, error: 'Événement introuvable.' }
	if (!event.upcoming) return { ok: false, status: 409, error: 'Cette date est passée.' }

	if (!event.attendance_requested) {
		await sql`UPDATE calendar_events SET attendance_requested = true WHERE id = ${eventId}`
		event = { ...event, attendance_requested: true, open: true }
	}

	const attendance = await attendanceOf(eventId, groupId)
	const responders = attendance.members.filter((m) => m.response).map((m) => m.user_id)
	const pending = attendance.members.filter((m) => !m.response && m.user_id !== actor.id).map((m) => m.user_id)
	if (pending.length > 0) {
		await sql`
			DELETE FROM notifications
			WHERE event_id = ${eventId} AND type = 'attendance' AND user_id = ANY(${sql.array(pending, INT4_OID)})
		`
		await notifyAttendance(event, actor, responders)
	}
	return { ok: true, value: { reminded: pending.length, attendance: { ...attendance, requested: true, open: true } } }
}

/** Ce qui attend une réponse du membre dans le groupe actif, la plus proche d'abord. */
export async function pendingAttendance(userId: number, groupId: number): Promise<PendingAttendance[]> {
	return sql<PendingAttendance[]>`
		SELECT
			e.id AS event_id, e.session_id, e.date::text AS date, e.type, e.title, e.location,
			to_char(e.start_time, 'HH24:MI') AS start_time, e.duration_min
		FROM calendar_events e
		WHERE e.group_id = ${groupId}
		  AND e.type <> 'indisponibilite'
		  AND e.attendance_requested
		  AND e.date >= CURRENT_DATE
		  AND NOT EXISTS (SELECT 1 FROM event_attendance a WHERE a.event_id = e.id AND a.user_id = ${userId})
		ORDER BY e.date, e.start_time NULLS LAST, e.id
		LIMIT 5
	`
}
