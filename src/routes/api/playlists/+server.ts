import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import sql from '$lib/server/db'
import { notifyGroup } from '$lib/server/notifications'

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const groupId = locals.user.current_group_id
	const recordingParam = url.searchParams.get('recording_id')
	let recordingId: number | null = null
	if (recordingParam !== null) {
		const parsedId = Number(recordingParam)
		if (!Number.isInteger(parsedId) || parsedId < 1) {
			return json({ error: 'recording_id invalide.' }, { status: 400 })
		}
		recordingId = parsedId
	}

	const playlists = await sql`
		SELECT
			p.*, COALESCE(MAX(u.display_name), p.created_by) AS created_by,
			COUNT(pi.id)::int AS item_count,
			${recordingId === null ? false : sql`EXISTS (
				SELECT 1 FROM playlist_items membership
				WHERE membership.playlist_id = p.id AND membership.recording_id = ${recordingId}
			)`} AS contains_recording
		FROM playlists p
		LEFT JOIN users u ON u.id = p.created_by_user_id
		LEFT JOIN playlist_items pi ON pi.playlist_id = p.id
		WHERE p.group_id = ${groupId}
		GROUP BY p.id
		ORDER BY p.updated_at DESC NULLS LAST, p.created_at DESC
	`
	return json(playlists)
}

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const body = await request.json()
	const name: unknown = body.name
	const description: unknown = body.description
	const recordingId: unknown = body.recording_id

	if (typeof name !== 'string' || !name.trim()) {
		return json({ error: 'Le nom est obligatoire.' }, { status: 400 })
	}

	if (recordingId !== undefined && (typeof recordingId !== 'number' || !Number.isInteger(recordingId) || recordingId < 1)) {
		return json({ error: 'recording_id invalide.' }, { status: 400 })
	}
	const selectedRecordingId = recordingId === undefined ? null : recordingId as number

	// La création depuis le sélecteur de prise est atomique : une erreur ne laisse pas
	// derrière elle une playlist vide que l'utilisateur n'avait pas demandée.
	const created = await sql.begin(async (tx) => {
		const [playlist] = await tx`
			INSERT INTO playlists (group_id, name, description, created_by, created_by_user_id, updated_at)
			VALUES (
				${locals.user!.current_group_id},
				${name.trim()},
				${typeof description === 'string' && description.trim() ? description.trim() : null},
				${locals.user!.display_name},
				${locals.user!.id},
				now()
			)
			RETURNING *
		`

		if (selectedRecordingId === null) return { playlist, item: null }

		const [recording] = await tx`
			SELECT r.id, r.file_path
			FROM recordings r
			JOIN sessions ses ON ses.id = r.session_id
			WHERE r.id = ${selectedRecordingId} AND ses.group_id = ${locals.user!.current_group_id}
		`
		if (!recording) throw Object.assign(new Error(), { code: 'recording_not_found' })
		if (!recording.file_path) throw Object.assign(new Error(), { code: 'not_audio' })

		const [item] = await tx`
			INSERT INTO playlist_items (playlist_id, recording_id, position)
			VALUES (${playlist.id}, ${selectedRecordingId}, 1)
			RETURNING *
		`
		return { playlist, item }
	}).catch((err: unknown) => {
		const code = (err as { code?: string }).code
		if (code === 'recording_not_found' || code === 'not_audio') return code
		throw err
	})

	if (created === 'recording_not_found') return json({ error: 'Prise introuvable.' }, { status: 404 })
	if (created === 'not_audio') {
		return json({ error: "Cette prise n'a pas de piste audio : elle ne peut pas entrer dans une playlist." }, { status: 400 })
	}

	const { playlist, item } = created

	await notifyGroup({
		groupId: locals.user.current_group_id,
		actor: locals.user,
		type: 'playlist',
		subject: playlist.name,
		excerpt: playlist.description,
		link: `/playlists/${playlist.id}`,
		playlistId: playlist.id
	})

	return json({ ...playlist, item }, { status: 201 })
}
