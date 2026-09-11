import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import sql from '$lib/server/db'
import { notifyGroup } from '$lib/server/notifications'
import { formatDateOnly } from '$lib/date'
import { sessionTypeLabel } from '$lib/types'

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const groupId = locals.user.current_group_id

	const sessions = await sql`
		SELECT
			s.*, COALESCE(MAX(u.display_name), s.created_by) AS created_by,
			COUNT(DISTINCT r.song_id)::int AS song_count,
			COUNT(r.id)::int             AS recording_count
		FROM sessions s
		LEFT JOIN users u ON u.id = s.created_by_user_id
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
	const type: unknown = body.type
	const title: unknown = body.title
	const location: unknown = body.location
	const notes: unknown = body.notes
	const members: unknown = body.members
	const linkEventId: unknown = body.link_event_id

	const validTypes = ['repetition', 'concert', 'studio', 'autre']

	if (typeof date !== 'string' || !date.trim()) {
		return json({ error: 'La date est obligatoire.' }, { status: 400 })
	}
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
		return json({ error: 'Format de date invalide (YYYY-MM-DD attendu).' }, { status: 400 })
	}
	if (type !== undefined && (typeof type !== 'string' || !validTypes.includes(type))) {
		return json({ error: 'Type de session invalide.' }, { status: 400 })
	}
	if (members !== undefined && !Array.isArray(members)) {
		return json({ error: 'members doit être un tableau.' }, { status: 400 })
	}
	if (linkEventId !== undefined && linkEventId !== null && typeof linkEventId !== 'number') {
		return json({ error: 'link_event_id invalide.' }, { status: 400 })
	}

	const membersArray: string[] = Array.isArray(members)
		? members.filter((m) => typeof m === 'string' && m.trim()).map((m: string) => m.trim())
		: []

	const resolvedType = typeof type === 'string' ? type : 'repetition'
	const resolvedTitle = typeof title === 'string' && title.trim() ? title.trim() : null
	const resolvedLocation = typeof location === 'string' && location.trim() ? location.trim() : null
	const resolvedNotes = typeof notes === 'string' && notes.trim() ? notes.trim() : null

	// Transformer un événement d'agenda existant en session : on réutilise sa ligne
	// calendar_events (on la lie via session_id) au lieu d'en insérer une seconde,
	// pour éviter un doublon sur le même jour.
	let linkedEventId: number | null = null
	if (typeof linkEventId === 'number') {
		const [event] = await sql`
			SELECT id FROM calendar_events
			WHERE id = ${linkEventId}
			  AND group_id = ${locals.user.current_group_id}
			  AND session_id IS NULL
			  AND type <> 'indisponibilite'
		`
		if (!event) {
			return json({ error: 'Événement introuvable ou déjà lié à une session.' }, { status: 400 })
		}
		linkedEventId = linkEventId
	}

	const session = await sql.begin(async (tx) => {
		const [session] = await tx`
			INSERT INTO sessions (group_id, date, type, title, location, notes, members, created_by, created_by_user_id)
			VALUES (
				${locals.user!.current_group_id},
				${date.trim()},
				${resolvedType},
				${resolvedTitle},
				${resolvedLocation},
				${resolvedNotes},
				${sql.array(membersArray)},
				${locals.user!.display_name},
				${locals.user!.id}
			)
			RETURNING *
		`

		if (linkedEventId) {
			await tx`
				UPDATE calendar_events
				SET date = ${date.trim()}::date, type = ${resolvedType}, title = ${resolvedTitle},
				    notes = ${resolvedNotes}, location = ${resolvedLocation}, session_id = ${session.id}
				WHERE id = ${linkedEventId}
			`
		} else {
			// Toute session apparaît automatiquement dans l'agenda, quel que soit son type
			await tx`
				INSERT INTO calendar_events (group_id, user_id, date, type, author, title, notes, location, session_id)
				VALUES (
					${locals.user!.current_group_id},
					${locals.user!.id},
					${date.trim()}::date,
					${resolvedType},
					${locals.user!.display_name},
					${resolvedTitle},
					${resolvedNotes},
					${resolvedLocation},
					${session.id}
				)
			`
		}

		return session
	})

	await notifyGroup({
		groupId: locals.user.current_group_id,
		actor: locals.user,
		type: 'session',
		subject:
			resolvedTitle ??
			`${sessionTypeLabel(resolvedType)} du ${formatDateOnly(date.trim(), { day: 'numeric', month: 'long', year: 'numeric' })}`,
		excerpt: resolvedLocation,
		link: `/sessions/${session.id}`,
		sessionId: session.id
	})

	return json(session, { status: 201 })
}
