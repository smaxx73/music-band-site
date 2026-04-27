import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import sql from '$lib/server/db'

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const month = url.searchParams.get('month')
	if (!month || !/^\d{4}-\d{2}$/.test(month)) {
		return json({ error: 'Paramètre month requis (YYYY-MM).' }, { status: 400 })
	}

	const [y, m] = month.split('-').map(Number)
	const start = `${y}-${String(m).padStart(2, '0')}-01`
	const nextY = m === 12 ? y + 1 : y
	const nextM = m === 12 ? 1 : m + 1
	const end = `${nextY}-${String(nextM).padStart(2, '0')}-01`

	const events = await sql`
		SELECT
			e.id, e.group_id, e.type, e.author, e.title, e.notes, e.session_id, e.created_at,
			to_char(e.date, 'YYYY-MM-DD') AS date,
			to_char(s.date, 'YYYY-MM-DD') AS session_date,
			s.location AS session_location
		FROM calendar_events e
		LEFT JOIN sessions s ON s.id = e.session_id
		WHERE e.group_id = ${locals.user.current_group_id}
			AND e.date >= ${start}::date
			AND e.date < ${end}::date
		ORDER BY e.date, e.created_at
	`

	return json(events)
}

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const body = await request.json()
	const { date, type, title, notes, session_id } = body

	if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
		return json({ error: 'Date invalide.' }, { status: 400 })
	}
	if (!['indisponibilite', 'repetition', 'concert'].includes(type)) {
		return json({ error: 'Type invalide.' }, { status: 400 })
	}

	let resolvedSessionId: number | null = null
	if (type !== 'indisponibilite' && typeof session_id === 'number') {
		const [session] = await sql`
			SELECT id FROM sessions WHERE id = ${session_id} AND group_id = ${locals.user.current_group_id}
		`
		if (!session) return json({ error: 'Session introuvable.' }, { status: 400 })
		resolvedSessionId = session_id
	}

	const [event] = await sql`
		INSERT INTO calendar_events (group_id, date, type, author, title, notes, session_id)
		VALUES (
			${locals.user.current_group_id},
			${date}::date,
			${type},
			${locals.user.name},
			${typeof title === 'string' && title.trim() ? title.trim() : null},
			${typeof notes === 'string' && notes.trim() ? notes.trim() : null},
			${resolvedSessionId}
		)
		RETURNING *
	`
	return json(event, { status: 201 })
}
