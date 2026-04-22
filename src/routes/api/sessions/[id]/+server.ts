import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import sql from '$lib/server/db'

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	const [session] = await sql`
		SELECT * FROM sessions WHERE id = ${id} AND group_id = ${locals.user.current_group_id}
	`
	if (!session) return json({ error: 'Session introuvable.' }, { status: 404 })

	const rows = await sql`
		SELECT
			r.id, r.take, r.status, r.notes, r.duration_s, r.uploaded_by, r.created_at, r.file_path,
			s.id   AS song_id,
			s.title AS song_title,
			s.composer AS song_composer,
			s.status AS song_status,
			COUNT(c.id)::int AS comment_count
		FROM recordings r
		JOIN songs s ON s.id = r.song_id
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

	if (body.date !== undefined && (typeof body.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.date))) {
		return json({ error: 'Format de date invalide (YYYY-MM-DD attendu).' }, { status: 400 })
	}
	if (body.members !== undefined && !Array.isArray(body.members)) {
		return json({ error: 'members doit être un tableau.' }, { status: 400 })
	}

	const updates: Record<string, unknown> = {}
	if (body.date !== undefined) updates.date = body.date
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

	const [session] = await sql`
		UPDATE sessions SET ${sql(updates)}
		WHERE id = ${id} AND group_id = ${locals.user.current_group_id}
		RETURNING *
	`
	if (!session) return json({ error: 'Session introuvable.' }, { status: 404 })

	return json(session)
}
