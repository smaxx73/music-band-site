import type { PageServerLoad } from './$types'
import { redirect } from '@sveltejs/kit'
import sql from '$lib/server/db'
import { loginRedirect } from '$lib/redirect'
import { listGroupPlaces } from '$lib/server/places'
import { listAttendance } from '$lib/server/attendance'
import type { EventAttendance } from '$lib/attendance'

function currentMonth(): string {
	const now = new Date()
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(302, loginRedirect(url))

	// `?date=YYYY-MM-DD` (liens du tableau de bord) ouvre le mois de ce jour, panneau
	// du jour déplié ; il l'emporte sur `?month=`.
	const dateParam = url.searchParams.get('date')
	const openDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : null
	const monthParam = openDate?.slice(0, 7) ?? url.searchParams.get('month')
	const month = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : currentMonth()
	const openDay = openDate ? Number(openDate.slice(8, 10)) : null
	// `&ajouter` : le panneau du jour s'ouvre sur le formulaire d'ajout (replié au téléphone).
	const openForm = openDate !== null && url.searchParams.has('ajouter')

	const groupId = locals.user.current_group_id
	if (!groupId) {
		return { events: [], sessions: [], places: [], attendance: {}, month, openDay, openForm, userName: locals.user.display_name }
	}

	const [y, m] = month.split('-').map(Number)
	const start = `${y}-${String(m).padStart(2, '0')}-01`
	const nextY = m === 12 ? y + 1 : y
	const nextM = m === 12 ? 1 : m + 1
	const end = `${nextY}-${String(nextM).padStart(2, '0')}-01`

	const [events, sessions, places] = await Promise.all([
		sql`
			SELECT
				e.id, e.group_id, e.user_id, e.type, COALESCE(u.display_name, e.author) AS author, e.title, e.notes, e.location, e.session_id, e.created_at,
				to_char(e.date, 'YYYY-MM-DD') AS date,
				to_char(s.date, 'YYYY-MM-DD') AS session_date,
				s.location AS session_location,
				e.location_lat, e.location_lon,
				to_char(e.start_time, 'HH24:MI') AS start_time, e.duration_min, e.attendance_requested
			FROM calendar_events e
			LEFT JOIN sessions s ON s.id = e.session_id
			LEFT JOIN users u ON u.id = e.user_id
			WHERE e.date >= ${start}::date
				AND e.date < ${end}::date
				AND (
					(e.group_id = ${groupId} AND e.type <> 'indisponibilite')
					OR
					(e.type = 'indisponibilite' AND e.user_id IN (
						SELECT user_id FROM user_groups WHERE group_id = ${groupId}
					))
				)
			ORDER BY e.date, e.start_time NULLS LAST, e.type, e.created_at
		`,
		sql`
			SELECT id, to_char(date, 'YYYY-MM-DD') AS date, location
			FROM sessions
			WHERE group_id = ${groupId}
			ORDER BY date DESC
			LIMIT 50
		`,
		// Pour relire l'adresse d'un lieu d'événement, désigné par son étiquette.
		listGroupPlaces(groupId)
	])

	// Présences des événements du groupe : qui vient, qui n'a pas répondu.
	const groupEventIds = events.filter((e) => e.type !== 'indisponibilite').map((e) => e.id as number)
	const attendance: Record<number, EventAttendance> = Object.fromEntries(
		await listAttendance(groupId, groupEventIds)
	)

	return { events, sessions, places, attendance, month, openDay, openForm, userName: locals.user.display_name, userId: locals.user.id }
}
