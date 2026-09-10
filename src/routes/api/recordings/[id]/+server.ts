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

	const [recording] = await sql`
		SELECT
			r.*,
			COALESCE(u.display_name, r.uploaded_by) AS uploaded_by,
			s.title      AS song_title,
			s.composer   AS song_composer,
			s.key        AS song_key,
			ses.date     AS session_date,
			ses.location AS session_location,
			ses.id       AS session_id
		FROM recordings r
		JOIN songs   s   ON s.id   = r.song_id
		JOIN sessions ses ON ses.id = r.session_id
		LEFT JOIN users u ON u.id = r.uploaded_by_user_id
		WHERE r.id = ${id}
		  AND ses.group_id = ${locals.user.current_group_id}
	`

	if (!recording) return json({ error: 'Prise introuvable.' }, { status: 404 })

	return json(recording)
}

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	const body = await request.json()

	if (body.status !== undefined && (typeof body.status !== 'string' || !body.status.trim() || body.status.length > 50)) {
		return json({ error: 'Qualité invalide (texte non vide, 50 caractères max).' }, { status: 400 })
	}

	const updates: Record<string, unknown> = {}
	if (body.status !== undefined) updates.status = body.status.trim()
	if ('notes' in body)
		updates.notes =
			typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null

	if (Object.keys(updates).length === 0) {
		return json({ error: 'Aucun champ à modifier.' }, { status: 400 })
	}

	const [recording] = await sql`
		UPDATE recordings r SET ${sql(updates)}
		FROM sessions ses
		WHERE r.id = ${id}
		  AND r.session_id = ses.id
		  AND ses.group_id = ${locals.user.current_group_id}
		RETURNING r.*
	`
	if (!recording) return json({ error: 'Prise introuvable.' }, { status: 404 })

	return json(recording)
}

export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	// Modération : une prise est supprimable par celui qui l'a uploadée ou par
	// un administrateur du groupe.
	const [target] = await sql`
		SELECT r.uploaded_by_user_id FROM recordings r
		JOIN sessions s ON s.id = r.session_id
		WHERE r.id = ${id} AND s.group_id = ${locals.user.current_group_id}
	`
	if (!target) return json({ error: 'Prise introuvable.' }, { status: 404 })
	if (!canDeleteGroupContent(locals.user, locals.user.current_group_id, target.uploaded_by_user_id)) {
		return json(
			{ error: "Seul l'auteur de la prise ou un administrateur du groupe peut la supprimer." },
			{ status: 403 }
		)
	}

	const [deleted] = await sql`
		DELETE FROM recordings r
		USING sessions s
		WHERE r.id = ${id}
		  AND r.session_id = s.id
		  AND s.group_id = ${locals.user.current_group_id}
		RETURNING r.id
	`
	if (!deleted) return json({ error: 'Prise introuvable.' }, { status: 404 })

	await unlink(audioPath(id)).catch(() => {})

	return json({ success: true })
}
