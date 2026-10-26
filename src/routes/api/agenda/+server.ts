import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import sql from '$lib/server/db'
import { notifyGroup } from '$lib/server/notifications'
import { formatDateOnly } from '$lib/date'
import { sessionTypeLabel } from '$lib/types'
import { parseCoords } from '$lib/places'
import { parseEventTime } from '$lib/event-time'
import { askAttendance } from '$lib/server/attendance'

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
			e.id, e.group_id, e.user_id, e.type, COALESCE(u.display_name, e.author) AS author, e.title, e.notes, e.location, e.session_id, e.created_at,
			to_char(e.date, 'YYYY-MM-DD') AS date,
			to_char(e.start_time, 'HH24:MI') AS start_time, e.duration_min, e.attendance_requested,
			to_char(s.date, 'YYYY-MM-DD') AS session_date,
			s.location AS session_location
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
	if (!['indisponibilite', 'repetition', 'concert', 'studio', 'autre'].includes(type)) {
		return json({ error: 'Type invalide.' }, { status: 400 })
	}
	// Coordonnées d'une adresse ponctuelle (Base Adresse Nationale), gardées avec le lieu.
	const coords = parseCoords(body.location_coords)
	if (coords === undefined) return json({ error: 'location_coords invalide.' }, { status: 400 })
	const resolvedLocation = typeof location === 'string' && location.trim() ? location.trim() : null
	const resolvedCoords = resolvedLocation ? coords : null

	if (type === 'indisponibilite') {
		const [event] = await sql`
			INSERT INTO calendar_events (user_id, group_id, date, type, author, notes, location, location_lat, location_lon)
			VALUES (
				${locals.user.id},
				NULL,
				${date}::date,
				'indisponibilite',
				${locals.user.display_name},
				${typeof notes === 'string' && notes.trim() ? notes.trim() : null},
				${resolvedLocation},
				${resolvedCoords?.lat ?? null},
				${resolvedCoords?.lon ?? null}
			)
			RETURNING *
		`

		// L'indisponibilité n'est rattachée à aucun groupe (group_id NULL), mais elle
		// intéresse les membres du groupe depuis lequel elle a été saisie.
		await notifyGroup({
			groupId: locals.user.current_group_id,
			actor: locals.user,
			type: 'agenda',
			subject: sessionTypeLabel('indisponibilite'),
			excerpt: agendaExcerpt(date, location),
			link: agendaLink(date)
		})

		return json(event, { status: 201 })
	}

	// Heure de début et de fin (« HH:MM ») : un événement de groupe seulement.
	const time = parseEventTime(body.start_time, body.end_time)
	if (!time) return json({ error: 'Heure invalide (HH:MM, fin seulement avec un début).' }, { status: 400 })

	let resolvedSessionId: number | null = null
	if (typeof session_id === 'number') {
		const [session] = await sql`
			SELECT id FROM sessions WHERE id = ${session_id} AND group_id = ${locals.user.current_group_id}
		`
		if (!session) return json({ error: 'Session introuvable.' }, { status: 400 })

		// Une session ne doit figurer qu'une fois dans l'agenda. Cette réponse
		// idempotente couvre notamment un double-clic sur « Ajouter à l’agenda ».
		const [existingEvent] = await sql`
			SELECT * FROM calendar_events
			WHERE group_id = ${locals.user.current_group_id} AND session_id = ${session_id}
			LIMIT 1
		`
		if (existingEvent) return json(existingEvent)
		resolvedSessionId = session_id
	}

	// Une date posée dans l'agenda se prépare : même ajoutée le jour même (« ce soir »),
	// elle demande qui vient. Une session créée le jour même, elle, l'est presque toujours
	// pendant la répétition — voir POST /api/sessions.
	const [event] = await sql`
		INSERT INTO calendar_events (
			group_id, user_id, date, type, author, title, notes, location, location_lat, location_lon, session_id,
			start_time, duration_min, attendance_requested
		)
		VALUES (
			${locals.user.current_group_id},
			${locals.user.id},
			${date}::date,
			${type},
			${locals.user.display_name},
			${typeof title === 'string' && title.trim() ? title.trim() : null},
			${typeof notes === 'string' && notes.trim() ? notes.trim() : null},
			${resolvedLocation},
			${resolvedCoords?.lat ?? null},
			${resolvedCoords?.lon ?? null},
			${resolvedSessionId},
			${time.start_time},
			${time.duration_min},
			${date}::date >= CURRENT_DATE
		)
		RETURNING *
	`

	// La demande de présence annonce la date et demande en plus : elle remplace la
	// notification de l'événement, pas en plus. Les sessions créent déjà la leur : ne
	// notifier ici que l'événement d'agenda autonome, sans quoi la même création
	// apparaîtrait deux fois.
	if (event.attendance_requested) {
		await askAttendance(event.id, locals.user.current_group_id, locals.user)
	} else if (resolvedSessionId === null) {
		await notifyGroup({
			groupId: locals.user.current_group_id,
			actor: locals.user,
			type: 'agenda',
			subject: typeof title === 'string' && title.trim() ? title.trim() : sessionTypeLabel(type),
			excerpt: agendaExcerpt(date, location),
			link: agendaLink(date)
		})
	}

	return json(event, { status: 201 })
}

/** L'agenda s'ouvre sur un mois : le lien pointe sur celui de l'événement. */
function agendaLink(date: string): string {
	return `/agenda?month=${date.slice(0, 7)}`
}

function agendaExcerpt(date: string, location: unknown): string {
	const day = formatDateOnly(date, { day: 'numeric', month: 'long', year: 'numeric' })
	return typeof location === 'string' && location.trim() ? `${day} — ${location.trim()}` : day
}
