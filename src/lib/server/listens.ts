import sql from './db'

/**
 * Écoutes d'une prise par les membres (`recording_listens`, migration 054). Le navigateur
 * dit qu'il y a eu écoute (`src/lib/listen-meter.ts`) ; ici on la range, une par membre,
 * par prise et par jour.
 */

/**
 * Compte une écoute du membre. Rend `false` si la prise n'est pas une prise avec piste
 * audio du groupe : rien à compter, et rien à dire de son existence.
 */
export async function recordListen(recordingId: number, groupId: number, userId: number): Promise<boolean> {
	const [recording] = await sql`
		SELECT r.id FROM recordings r
		JOIN sessions s ON s.id = r.session_id
		WHERE r.id = ${recordingId} AND s.group_id = ${groupId} AND r.file_path IS NOT NULL
	`
	if (!recording) return false
	await sql`
		INSERT INTO recording_listens (recording_id, user_id)
		VALUES (${recordingId}, ${userId})
		ON CONFLICT DO NOTHING
	`
	return true
}

export type Listener = { user_id: number; name: string; last_day: string }

/** Les membres qui ont écouté la prise, le plus récent d'abord. */
export async function listenersOf(recordingId: number): Promise<Listener[]> {
	return sql<Listener[]>`
		SELECT u.id AS user_id, u.display_name AS name, to_char(MAX(l.day), 'YYYY-MM-DD') AS last_day
		FROM recording_listens l
		JOIN users u ON u.id = l.user_id
		WHERE l.recording_id = ${recordingId}
		GROUP BY u.id
		ORDER BY MAX(l.day) DESC, u.display_name
	`
}
