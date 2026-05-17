import type { PageServerLoad } from './$types'
import { redirect } from '@sveltejs/kit'
import sql from '$lib/server/db'

function currentMonth(): string {
	const now = new Date()
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(302, '/login')

	const monthParam = url.searchParams.get('month')
	const month = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : currentMonth()

	const groupId = locals.user.current_group_id
	if (!groupId) {
		return { events: [], sessions: [], month, userName: locals.user.name }
	}

	const [y, m] = month.split('-').map(Number)
	const start = `${y}-${String(m).padStart(2, '0')}-01`
	const nextY = m === 12 ? y + 1 : y
	const nextM = m === 12 ? 1 : m + 1
	const end = `${nextY}-${String(nextM).padStart(2, '0')}-01`

	const [events, sessions] = await Promise.all([
		sql`
			SELECT
				e.id, e.group_id, e.user_id, e.type, e.author, e.title, e.notes, e.location, e.session_id, e.created_at,
				to_char(e.date, 'YYYY-MM-DD') AS date,
				to_char(s.date, 'YYYY-MM-DD') AS session_date,
				s.location AS session_location
			FROM calendar_events e
			LEFT JOIN sessions s ON s.id = e.session_id
			WHERE e.date >= ${start}::date
				AND e.date < ${end}::date
				AND (
					(e.group_id = ${groupId} AND e.type IN ('repetition', 'concert'))
					OR
					(e.type = 'indisponibilite' AND e.user_id IN (
						SELECT user_id FROM user_groups WHERE group_id = ${groupId}
					))
				)
			ORDER BY e.date, e.type, e.created_at
		`,
		sql`
			SELECT id, to_char(date, 'YYYY-MM-DD') AS date, location
			FROM sessions
			WHERE group_id = ${groupId}
			ORDER BY date DESC
			LIMIT 50
		`
	])

	return { events, sessions, month, userName: locals.user.name, userId: locals.user.id }
}
