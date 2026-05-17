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
	const groupId = locals.user.current_group_id

	const events = await sql`
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
	`

	return json(events)
}

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const body = await request.json()
	const { date, type, title, notes, location, session_id } = body

	if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
		return json({ error: 'Date invalide.' }, { status: 400 })
	}
	if (!['indisponibilite', 'repetition', 'concert'].includes(type)) {
		return json({ error: 'Type invalide.' }, { status: 400 })
	}

	if (type === 'indisponibilite') {
		const [event] = await sql`
			INSERT INTO calendar_events (user_id, group_id, date, type, author, notes, location)
			VALUES (
				${locals.user.id},
				NULL,
				${date}::date,
				'indisponibilite',
				${locals.user.name},
				${typeof notes === 'string' && notes.trim() ? notes.trim() : null},
				${typeof location === 'string' && location.trim() ? location.trim() : null}
			)
			RETURNING *
		`
		return json(event, { status: 201 })
	}

	let resolvedSessionId: number | null = null
	if (typeof session_id === 'number') {
		const [session] = await sql`
			SELECT id FROM sessions WHERE id = ${session_id} AND group_id = ${locals.user.current_group_id}
		`
		if (!session) return json({ error: 'Session introuvable.' }, { status: 400 })
		resolvedSessionId = session_id
	}

	const [event] = await sql`
		INSERT INTO calendar_events (group_id, user_id, date, type, author, title, notes, location, session_id)
		VALUES (
			${locals.user.current_group_id},
			NULL,
			${date}::date,
			${type},
			${locals.user.name},
			${typeof title === 'string' && title.trim() ? title.trim() : null},
			${typeof notes === 'string' && notes.trim() ? notes.trim() : null},
			${typeof location === 'string' && location.trim() ? location.trim() : null},
			${resolvedSessionId}
		)
		RETURNING *
	`
	return json(event, { status: 201 })
}
