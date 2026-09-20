import sql from './db'
import type { Setlist, SetlistItemView } from '$lib/types'

/**
 * Lecture des setlists du groupe. Le temps total ne se stocke pas : il se somme
 * depuis `songs.reference_duration_s`, qui peut changer à tout moment dans /songs.
 * Les morceaux sans durée de référence sont comptés à part — un total qui les
 * compterait pour zéro se lirait comme un total exact.
 */

export type SetlistRow = Setlist & {
	song_count: number
	total_duration_s: number
	missing_duration_count: number
}

/** Le nom de l'auteur est relu depuis `users` ; `created_by` n'est qu'un repli. */
const DURATION_COLUMNS = sql`
	COUNT(si.id)::int AS song_count,
	COALESCE(SUM(so.reference_duration_s), 0)::int AS total_duration_s,
	COUNT(si.id) FILTER (WHERE so.reference_duration_s IS NULL)::int AS missing_duration_count
`

export function listSetlists(groupId: number) {
	return sql<SetlistRow[]>`
		SELECT s.*, COALESCE(MAX(u.display_name), s.created_by) AS created_by, ${DURATION_COLUMNS}
		FROM setlists s
		LEFT JOIN users u ON u.id = s.created_by_user_id
		LEFT JOIN setlist_items si ON si.setlist_id = s.id
		LEFT JOIN songs so ON so.id = si.song_id
		WHERE s.group_id = ${groupId}
		GROUP BY s.id
		ORDER BY s.updated_at DESC NULLS LAST, s.created_at DESC
	`
}

/** Une setlist du groupe actif, ou `null` — le 404 appartient à l'appelant. */
export async function getSetlist(id: number, groupId: number): Promise<SetlistRow | null> {
	const [setlist] = await sql<SetlistRow[]>`
		SELECT s.*, COALESCE(MAX(u.display_name), s.created_by) AS created_by, ${DURATION_COLUMNS}
		FROM setlists s
		LEFT JOIN users u ON u.id = s.created_by_user_id
		LEFT JOIN setlist_items si ON si.setlist_id = s.id
		LEFT JOIN songs so ON so.id = si.song_id
		WHERE s.id = ${id} AND s.group_id = ${groupId}
		GROUP BY s.id
	`
	return setlist ?? null
}

export function setlistItems(setlistId: number) {
	return sql<SetlistItemView[]>`
		SELECT
			si.id, si.setlist_id, si.song_id, si.position,
			so.title    AS song_title,
			so.composer AS song_composer,
			so.key      AS song_key,
			so.status   AS song_status,
			so.reference_duration_s
		FROM setlist_items si
		JOIN songs so ON so.id = si.song_id
		WHERE si.setlist_id = ${setlistId}
		ORDER BY si.position ASC
	`
}
