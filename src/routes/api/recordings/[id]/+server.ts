import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import { unlink } from 'fs/promises'
import sql from '$lib/server/db'
import { audioPath } from '$lib/server/storage'
import { canDeleteGroupContent } from '$lib/types'
import { PLACEHOLDER_SONG_PREFIX } from '$lib/songs'

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

	if (body.song_id !== undefined) {
		const songId = Number(body.song_id)
		if (!Number.isInteger(songId) || songId <= 0) {
			return json({ error: 'Morceau invalide.' }, { status: 400 })
		}
		if (body.status !== undefined || 'notes' in body) {
			return json({ error: 'Changer de morceau se fait seul, sans autre champ.' }, { status: 400 })
		}
		return moveToSong(id, songId, locals.user.current_group_id)
	}

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

/**
 * Rattache une prise mal classée à un autre morceau. Le numéro de prise est global au
 * morceau : la prise prend donc le suivant chez son nouveau morceau, calculé dans la
 * transaction comme à l'upload, et laisse un trou chez l'ancien — on ne renumérote pas,
 * comme à la suppression d'une prise.
 */
async function moveToSong(id: number, songId: number, groupId: number) {
	type Outcome =
		| { ok: true; recording: Record<string, unknown>; removed_song_id: number | null }
		| { ok: false; status: number; error: string }

	const outcome: Outcome = await sql.begin(async (tx) => {
		const [current] = await tx<{ song_id: number }[]>`
			SELECT r.song_id FROM recordings r
			JOIN sessions ses ON ses.id = r.session_id
			WHERE r.id = ${id} AND ses.group_id = ${groupId}
			FOR UPDATE OF r
		`
		if (!current) return { ok: false as const, status: 404, error: 'Prise introuvable.' }
		if (current.song_id === songId) {
			return { ok: false as const, status: 400, error: 'La prise est déjà rattachée à ce morceau.' }
		}

		// Verrou sur le morceau visé : deux prises qui y arrivent en même temps ne
		// calculent pas le même numéro.
		const [target] = await tx<{ status: string }[]>`
			SELECT status FROM songs WHERE id = ${songId} AND group_id = ${groupId} FOR UPDATE
		`
		if (!target) return { ok: false as const, status: 404, error: 'Morceau introuvable.' }
		if (target.status === 'abandonne') {
			return { ok: false as const, status: 400, error: 'Ce morceau est abandonné.' }
		}

		const [recording] = await tx`
			UPDATE recordings SET
				song_id = ${songId},
				take = (SELECT COALESCE(MAX(take), 0) + 1 FROM recordings WHERE song_id = ${songId})
			WHERE id = ${id}
			RETURNING *
		`

		// Un morceau « à nommer » n'existait que pour porter cette prise : vidé, il
		// encombrerait le référentiel sans rien désigner. Un morceau nommé, lui, reste —
		// quelqu'un l'a choisi. Programmé dans une setlist, il a pris un sens : il reste aussi.
		const [removed] = await tx<{ id: number }[]>`
			DELETE FROM songs s
			WHERE s.id = ${current.song_id}
			  AND starts_with(s.title, ${PLACEHOLDER_SONG_PREFIX})
			  AND NOT EXISTS (SELECT 1 FROM recordings WHERE song_id = s.id)
			  AND NOT EXISTS (SELECT 1 FROM setlist_items WHERE song_id = s.id)
			RETURNING s.id
		`
		return { ok: true as const, recording, removed_song_id: removed?.id ?? null }
	})

	if (!outcome.ok) return json({ error: outcome.error }, { status: outcome.status })
	return json({ ...outcome.recording, removed_song_id: outcome.removed_song_id })
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
		RETURNING r.id, r.file_path
	`
	if (!deleted) return json({ error: 'Prise introuvable.' }, { status: 404 })

	// Une prise vidéo seule n'a pas de fichier : la vidéo, elle, reste sur YouTube.
	if (deleted.file_path) await unlink(audioPath(id)).catch(() => {})

	return json({ success: true })
}
