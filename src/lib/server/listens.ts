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

/** Le nombre de membres qui ont écouté la prise : tout ce que le groupe en voit. */
export async function listenerCount(recordingId: number): Promise<number> {
	const [row] = await sql<{ count: number }[]>`
		SELECT COUNT(DISTINCT user_id)::int AS count
		FROM recording_listens
		WHERE recording_id = ${recordingId}
	`
	return row.count
}

export type GroupListens = {
	recording_id: number
	take: number
	song_title: string
	session_date: string
	listeners: { name: string; last_day: string }[]
}

/**
 * Qui a écouté quoi dans le groupe, les prises écoutées le plus récemment d'abord. Pour
 * `/group/listens` seulement : à l'écran du groupe, le nombre suffit, et des noms y
 * désigneraient par déduction ceux qui n'ont pas écouté.
 */
export async function groupListens(groupId: number, limit: number): Promise<GroupListens[]> {
	return sql<GroupListens[]>`
		SELECT r.id AS recording_id, r.take, so.title AS song_title,
		       to_char(ses.date, 'YYYY-MM-DD') AS session_date,
		       json_agg(json_build_object('name', l.name, 'last_day', l.last_day)
		                ORDER BY l.last_day DESC, l.name) AS listeners
		FROM (
			SELECT rl.recording_id, u.display_name AS name, to_char(MAX(rl.day), 'YYYY-MM-DD') AS last_day
			FROM recording_listens rl
			JOIN users u ON u.id = rl.user_id
			GROUP BY rl.recording_id, u.id
		) l
		JOIN recordings r ON r.id = l.recording_id
		JOIN sessions ses ON ses.id = r.session_id
		JOIN songs so ON so.id = r.song_id
		WHERE ses.group_id = ${groupId}
		GROUP BY r.id, so.title, ses.date
		ORDER BY MAX(l.last_day) DESC, ses.date DESC, r.take
		LIMIT ${limit}
	`
}
