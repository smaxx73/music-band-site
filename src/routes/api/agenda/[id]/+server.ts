import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import sql from '$lib/server/db'
import { parseEventTime } from '$lib/event-time'
import { parseCoords } from '$lib/places'
import { SESSION_TYPES } from '$lib/types'
import { parseProgramSongIds, programSongsError, writeEventProgram } from '$lib/server/event-program'
import { restartAttendance } from '$lib/server/attendance'

async function getAccessibleEvent(id: number, locals: App.Locals) {
	if (!locals.user || !locals.user.current_group_id) return null
	const groupId = locals.user.current_group_id

	const [event] = await sql`
		SELECT *, date::text AS day FROM calendar_events
		WHERE id = ${id}
			AND (
				(group_id = ${groupId} AND type <> 'indisponibilite')
				OR
				(type = 'indisponibilite' AND user_id IN (
					SELECT user_id FROM user_groups WHERE group_id = ${groupId}
				))
			)
	`
	return event ?? null
}

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	const event = await getAccessibleEvent(id, locals)
	if (!event) return json({ error: 'Événement introuvable.' }, { status: 404 })

	if (event.type === 'indisponibilite' && event.user_id !== locals.user.id) {
		return json({ error: 'Vous ne pouvez modifier que votre propre indisponibilité.' }, { status: 403 })
	}

	const body = await request.json()

	// La date, le titre, le type, le lieu et les notes de l'événement d'une session sont ceux
	// de la session : PATCH /api/sessions/[id] les réécrirait. Ils ne se changent que là-bas.
	const ownFields = event.session_id === null
	let date: string = event.day
	if (ownFields && 'date' in body) {
		if (typeof body.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
			return json({ error: 'Date invalide.' }, { status: 400 })
		}
		date = body.date
	}

	const title = ownFields && typeof body.title === 'string' ? (body.title.trim() || null) : event.title
	const notes = ownFields && typeof body.notes === 'string' ? (body.notes.trim() || null) : event.notes

	let type = event.type
	if (ownFields && event.type !== 'indisponibilite' && 'type' in body) {
		if (!SESSION_TYPES.includes(body.type)) return json({ error: 'Type invalide.' }, { status: 400 })
		type = body.type
	}

	// Changer le lieu sans coordonnées les efface : elles décrivaient l'ancien.
	let location = event.location
	let locationLat = event.location_lat
	let locationLon = event.location_lon
	if (ownFields && 'location' in body) {
		const coords = parseCoords(body.location_coords)
		if (coords === undefined) return json({ error: 'location_coords invalide.' }, { status: 400 })
		location = typeof body.location === 'string' && body.location.trim() ? body.location.trim() : null
		locationLat = location ? (coords?.lat ?? null) : null
		locationLon = location ? (coords?.lon ?? null) : null
	}

	// L'heure ne se change que sur un événement de groupe, et seulement si elle est envoyée.
	// Pas de notification : les réponses restent, l'heure se lit sur la date.
	let startTime = event.start_time
	let durationMin = event.duration_min
	if (event.type !== 'indisponibilite' && ('start_time' in body || 'end_time' in body)) {
		const time = parseEventTime(body.start_time, body.end_time)
		if (!time) return json({ error: 'Heure invalide (HH:MM, fin seulement avec un début).' }, { status: 400 })
		startTime = time.start_time
		durationMin = time.duration_min
	}

	let sessionId = event.session_id
	if (event.type !== 'indisponibilite' && 'session_id' in body) {
		sessionId = typeof body.session_id === 'number' ? body.session_id : null
		if (sessionId !== null) {
			const [session] = await sql`
				SELECT id FROM sessions WHERE id = ${sessionId} AND group_id = ${locals.user.current_group_id}
			`
			if (!session) return json({ error: 'Session introuvable.' }, { status: 400 })
		}
	}

	// Le programme se réécrit en entier, seulement s'il est envoyé. Pas de notification,
	// comme pour l'heure : il se lit sur la date.
	let songIds: number[] | null = null
	if (event.type !== 'indisponibilite' && 'song_ids' in body) {
		songIds = parseProgramSongIds(body.song_ids)
		if (!songIds) return json({ error: 'song_ids invalide.' }, { status: 400 })
		const programError = await programSongsError(locals.user.current_group_id, songIds, id)
		if (programError) return json({ error: programError }, { status: 400 })
	}

	const updated = await sql.begin(async (tx) => {
		// L'UPDATE d'abord : le verrou de la ligne fait attendre une seconde écriture du programme.
		const [row] = await tx`
			UPDATE calendar_events
			SET date = ${date}::date, title = ${title}, notes = ${notes}, type = ${type}, session_id = ${sessionId},
			    location = ${location}, location_lat = ${locationLat}, location_lon = ${locationLon},
			    start_time = ${startTime}, duration_min = ${durationMin}
			WHERE id = ${id}
			RETURNING *
		`
		if (songIds) await writeEventProgram(tx, id, songIds)
		return row
	})

	// Les réponses données pour l'ancienne date ne valent plus : la question est reposée.
	if (event.type !== 'indisponibilite' && date !== event.day) {
		await restartAttendance(id, locals.user.current_group_id, locals.user, { fromToday: true })
	}

	return json(updated)
}

export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	const event = await getAccessibleEvent(id, locals)
	if (!event) return json({ error: 'Événement introuvable.' }, { status: 404 })

	if (event.type === 'indisponibilite' && event.user_id !== locals.user.id) {
		return json({ error: 'Vous ne pouvez supprimer que votre propre indisponibilité.' }, { status: 403 })
	}

	// Toute session figure à l'agenda par cet événement : le supprimer seul la ferait
	// disparaître du calendrier. Il part avec la session (DELETE /api/sessions/[id]).
	if (event.session_id) {
		return json(
			{ error: 'Cet événement est celui d’une session : supprimez la session elle-même.' },
			{ status: 409 }
		)
	}

	await sql`DELETE FROM calendar_events WHERE id = ${id}`
	return json({ success: true })
}
