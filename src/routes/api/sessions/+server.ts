import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import sql from '$lib/server/db'

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const groupId = locals.user.current_group_id

	const sessions = await sql`
		SELECT
			s.*,
			COUNT(DISTINCT r.song_id)::int AS song_count,
			COUNT(r.id)::int             AS recording_count
		FROM sessions s
		LEFT JOIN recordings r ON r.session_id = s.id
		WHERE s.group_id = ${groupId}
		GROUP BY s.id
		ORDER BY s.date DESC
	`
	return json(sessions)
}

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const body = await request.json()
	const date: unknown = body.date
	const location: unknown = body.location
	const notes: unknown = body.notes
	const members: unknown = body.members

	if (typeof date !== 'string' || !date.trim()) {
		return json({ error: 'La date est obligatoire.' }, { status: 400 })
	}
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
		return json({ error: 'Format de date invalide (YYYY-MM-DD attendu).' }, { status: 400 })
	}
	if (members !== undefined && !Array.isArray(members)) {
		return json({ error: 'members doit être un tableau.' }, { status: 400 })
	}

	const membersArray: string[] = Array.isArray(members)
		? members.filter((m) => typeof m === 'string' && m.trim()).map((m: string) => m.trim())
		: []

	const [session] = await sql`
		INSERT INTO sessions (group_id, date, location, notes, members, created_by)
		VALUES (
			${locals.user.current_group_id},
			${date.trim()},
			${typeof location === 'string' && location.trim() ? location.trim() : null},
			${typeof notes === 'string' && notes.trim() ? notes.trim() : null},
			${sql.array(membersArray)},
			${locals.user.name}
		)
		RETURNING *
	`
	return json(session, { status: 201 })
}
