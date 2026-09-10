import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import { unlink } from 'fs/promises'
import sql from '$lib/server/db'
import { audioPath } from '$lib/server/storage'
import { canDeleteGroupContent } from '$lib/types'

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	const [session] = await sql`
		SELECT s.*, COALESCE(u.display_name, s.created_by) AS created_by
		FROM sessions s
		LEFT JOIN users u ON u.id = s.created_by_user_id
		WHERE s.id = ${id} AND s.group_id = ${locals.user.current_group_id}
	`
	if (!session) return json({ error: 'Session introuvable.' }, { status: 404 })

	const rows = await sql`
		SELECT
			r.id, r.take, r.status, r.notes, r.duration_s, COALESCE(MAX(u.display_name), r.uploaded_by) AS uploaded_by, r.created_at, r.file_path,
			s.id   AS song_id,
			s.title AS song_title,
			s.composer AS song_composer,
			s.status AS song_status,
			COUNT(c.id)::int AS comment_count
		FROM recordings r
		JOIN songs s ON s.id = r.song_id
		LEFT JOIN users u ON u.id = r.uploaded_by_user_id
		LEFT JOIN comments c ON c.recording_id = r.id
		WHERE r.session_id = ${id}
		GROUP BY r.id, s.id
		ORDER BY s.title, r.take ASC
	`

	// Grouper par morceau
	const groupMap = new Map<number, { song: Record<string, unknown>; recordings: unknown[] }>()
	for (const row of rows) {
		const sid = row.song_id as number
		if (!groupMap.has(sid)) {
			groupMap.set(sid, {
				song: {
					id: row.song_id,
					title: row.song_title,
					composer: row.song_composer,
					status: row.song_status
				},
				recordings: []
			})
		}
		groupMap.get(sid)!.recordings.push({
			id: row.id,
			take: row.take,
			status: row.status,
			notes: row.notes,
			duration_s: row.duration_s,
			uploaded_by: row.uploaded_by,
			created_at: row.created_at,
			file_path: row.file_path,
			comment_count: row.comment_count
		})
	}

	return json({ session, groups: Array.from(groupMap.values()) })
}

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	const body = await request.json()
	const validTypes = ['repetition', 'concert', 'studio', 'autre']

	if (body.date !== undefined && (typeof body.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.date))) {
		return json({ error: 'Format de date invalide (YYYY-MM-DD attendu).' }, { status: 400 })
	}
	if (body.type !== undefined && !validTypes.includes(body.type)) {
		return json({ error: 'Type de session invalide.' }, { status: 400 })
	}
	if (body.members !== undefined && !Array.isArray(body.members)) {
		return json({ error: 'members doit être un tableau.' }, { status: 400 })
	}

	const updates: Record<string, unknown> = {}
	if (body.date !== undefined) updates.date = body.date
	if (body.type !== undefined) updates.type = body.type
	if ('title' in body)
		updates.title =
			typeof body.title === 'string' && body.title.trim() ? body.title.trim() : null
	if ('location' in body)
		updates.location =
			typeof body.location === 'string' && body.location.trim() ? body.location.trim() : null
	if ('notes' in body)
		updates.notes =
			typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null
	if (body.members !== undefined)
		updates.members = (body.members as string[]).filter((m) => typeof m === 'string' && m.trim())

	if (Object.keys(updates).length === 0) {
		return json({ error: 'Aucun champ à modifier.' }, { status: 400 })
	}

	const result = await sql.begin(async (tx) => {
		const [session] = await tx`
			UPDATE sessions SET ${tx(updates)}
			WHERE id = ${id} AND group_id = ${locals.user!.current_group_id}
			RETURNING *
		`
		if (!session) return null

		// Garder l'agenda synchronisé avec la session, quel que soit son type
		const [linkedEvent] = await tx`
			SELECT id FROM calendar_events WHERE session_id = ${id}
		`

		if (linkedEvent) {
			await tx`
				UPDATE calendar_events
				SET date = ${session.date}, type = ${session.type}, title = ${session.title},
					notes = ${session.notes}, location = ${session.location}
				WHERE id = ${linkedEvent.id}
			`
		} else {
			await tx`
				INSERT INTO calendar_events (group_id, user_id, date, type, author, title, notes, location, session_id)
				VALUES (
					${session.group_id}, ${locals.user!.id}, ${session.date}, ${session.type}, ${locals.user!.display_name},
					${session.title}, ${session.notes}, ${session.location}, ${session.id}
				)
			`
		}

		return session
	})

	if (!result) return json({ error: 'Session introuvable.' }, { status: 404 })

	return json(result)
}

export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	// Modération : une session est supprimable par son créateur ou par un
	// administrateur du groupe. Le contrôle précède la lecture des prises.
	const [target] = await sql`
		SELECT created_by_user_id FROM sessions
		WHERE id = ${id} AND group_id = ${locals.user.current_group_id}
	`
	if (!target) return json({ error: 'Session introuvable.' }, { status: 404 })
	if (!canDeleteGroupContent(locals.user, locals.user.current_group_id, target.created_by_user_id)) {
		return json(
			{ error: "Seul l'auteur de la session ou un administrateur du groupe peut la supprimer." },
			{ status: 403 }
		)
	}

	const recordings = await sql`
		SELECT r.id FROM recordings r
		JOIN sessions s ON s.id = r.session_id
		WHERE r.session_id = ${id} AND s.group_id = ${locals.user.current_group_id}
	`

	const deleted = await sql.begin(async (tx) => {
		const [session] = await tx`
			SELECT id FROM sessions WHERE id = ${id} AND group_id = ${locals.user!.current_group_id}
		`
		if (!session) return null

		// Retirer l'événement d'agenda lié avant de supprimer la session
		await tx`DELETE FROM calendar_events WHERE session_id = ${id}`

		const [deleted] = await tx`
			DELETE FROM sessions WHERE id = ${id} RETURNING id
		`
		return deleted
	})
	if (!deleted) return json({ error: 'Session introuvable.' }, { status: 404 })

	for (const r of recordings) {
		await unlink(audioPath(r.id as number)).catch(() => {})
	}

	return json({ success: true })
}
