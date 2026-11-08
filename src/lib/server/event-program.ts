import type { TransactionSql } from 'postgres'
import sql from './db'
import type { EventProgramSong, ProgramSetlist } from '$lib/types'

// Programme de travail d'un événement de groupe : les morceaux qu'on prévoit de travailler à
// cette date, dans l'ordre. Facultatif, et porté par l'événement comme les présences : toute
// session a le sien, et un événement transformé en session garde son programme.

// Type des éléments passé à sql.array, comme dans notifications.ts.
const INT4_OID = 23

const MAX_PROGRAM_SONGS = 50

const SONG_COLUMNS = sql`
	so.id, so.id AS song_id,
	so.title    AS song_title,
	so.composer AS song_composer,
	so.key      AS song_key,
	so.status   AS song_status,
	so.reference_duration_s
`

/** Les programmes d'un lot d'événements du groupe, par événement. */
export async function listEventPrograms(
	groupId: number,
	eventIds: number[]
): Promise<Map<number, EventProgramSong[]>> {
	const programs = new Map<number, EventProgramSong[]>()
	if (eventIds.length === 0) return programs
	const rows = await sql<(EventProgramSong & { event_id: number })[]>`
		SELECT p.event_id, ${SONG_COLUMNS}
		FROM event_program_songs p
		JOIN songs so ON so.id = p.song_id
		WHERE p.event_id = ANY(${sql.array(eventIds, INT4_OID)}) AND so.group_id = ${groupId}
		ORDER BY p.event_id, p.position
	`
	for (const { event_id, ...song } of rows) {
		programs.set(event_id, [...(programs.get(event_id) ?? []), song])
	}
	return programs
}

/** Le programme de l'événement d'une session : c'est sur la session qu'on répète. */
export function sessionProgram(sessionId: number, groupId: number) {
	return sql<EventProgramSong[]>`
		SELECT ${SONG_COLUMNS}
		FROM event_program_songs p
		JOIN songs so ON so.id = p.song_id
		WHERE p.event_id = (
			SELECT e.id FROM calendar_events e
			WHERE e.session_id = ${sessionId} AND e.group_id = ${groupId}
			ORDER BY e.id LIMIT 1
		)
		ORDER BY p.position
	`
}

/** Ce qu'on peut ajouter à un programme. Un morceau abandonné ne se programme pas. */
export function programmableSongs(groupId: number) {
	return sql<EventProgramSong[]>`
		SELECT ${SONG_COLUMNS}
		FROM songs so
		WHERE so.group_id = ${groupId} AND so.status IS DISTINCT FROM 'abandonne'
		ORDER BY so.title ASC
	`
}

/**
 * Les setlists qu'un programme peut reprendre, les plus récemment modifiées d'abord. La
 * reprise est une copie faite à l'écran : la setlist et le programme vivent ensuite chacun
 * de leur côté. Sans ses morceaux abandonnés, et sans les setlists que cela laisse vides.
 */
export function programSetlists(groupId: number) {
	return sql<ProgramSetlist[]>`
		SELECT sl.id, sl.name, ARRAY_AGG(si.song_id ORDER BY si.position) AS song_ids
		FROM setlists sl
		JOIN setlist_items si ON si.setlist_id = sl.id
		JOIN songs so ON so.id = si.song_id
		WHERE sl.group_id = ${groupId} AND so.status IS DISTINCT FROM 'abandonne'
		GROUP BY sl.id
		ORDER BY sl.updated_at DESC NULLS LAST, sl.created_at DESC
	`
}

/** `song_ids` tel qu'envoyé par le client, sans doublon ; `null` s'il est mal formé. */
export function parseProgramSongIds(value: unknown): number[] | null {
	if (!Array.isArray(value) || value.length > MAX_PROGRAM_SONGS) return null
	if (!value.every((id) => Number.isInteger(id) && id > 0)) return null
	return [...new Set(value as number[])]
}

/**
 * Le message d'erreur si ces morceaux ne peuvent pas former le programme, sinon `null`.
 * Un morceau abandonné après coup reste accepté s'il y figurait déjà : sans quoi le
 * programme ne pourrait plus être réordonné.
 */
export async function programSongsError(
	groupId: number,
	songIds: number[],
	eventId: number | null
): Promise<string | null> {
	if (songIds.length === 0) return null
	const songs = await sql<{ status: string | null; programmed: boolean }[]>`
		SELECT so.status, EXISTS (
			SELECT 1 FROM event_program_songs p WHERE p.event_id = ${eventId} AND p.song_id = so.id
		) AS programmed
		FROM songs so
		WHERE so.id = ANY(${sql.array(songIds, INT4_OID)}) AND so.group_id = ${groupId}
	`
	if (songs.length !== songIds.length) return 'Morceau introuvable.'
	if (songs.some((song) => song.status === 'abandonne' && !song.programmed)) {
		return 'Un morceau abandonné ne peut pas être programmé.'
	}
	return null
}

/** Réécrit tout le programme, dans la transaction de l'événement. Vide : plus de programme. */
export async function writeEventProgram<T extends Record<string, unknown>>(
	tx: TransactionSql<T>,
	eventId: number,
	songIds: number[]
) {
	await tx`DELETE FROM event_program_songs WHERE event_id = ${eventId}`
	if (songIds.length === 0) return
	await tx`
		INSERT INTO event_program_songs (event_id, song_id, position)
		SELECT ${eventId}::int, t.song_id, t.position
		FROM unnest(${sql.array(songIds, INT4_OID)}::int[]) WITH ORDINALITY AS t(song_id, position)
	`
}
