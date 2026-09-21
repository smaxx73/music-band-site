import { mkdir, unlink } from 'fs/promises'
import { join } from 'path'
import sql from './db'
import { audioDir } from './config'
import { loadPeaksAt, type PeaksCache } from './peaks'
import type { PersonalRecording } from '$lib/types'

// L'espace perso appartient à un utilisateur, pas à un groupe. Toutes les requêtes de
// ce module filtrent donc sur `user_id` : c'est la vérification de droit, admins
// compris — personne ne lit le carnet d'un autre. La seule porte vers un groupe est
// une publication (`posts`), qui ouvre l'écoute au groupe où elle a été faite.

const PERSONAL_SUBDIR = 'perso'

/** Longueur maximale d'un titre : au-delà, il ne tient plus sur une ligne de liste. */
export const PERSONAL_TITLE_MAX = 200
export const PERSONAL_NOTES_MAX = 2000

/** Chemin relatif à AUDIO_DIR, tel que stocké dans `personal_recordings.file_path`. */
export function personalFilePath(id: number): string {
	return `${PERSONAL_SUBDIR}/${id}.mp3`
}

export function personalAudioPath(id: number): string {
	return join(audioDir(), personalFilePath(id))
}

export async function ensurePersonalDir(): Promise<void> {
	await mkdir(join(audioDir(), PERSONAL_SUBDIR), { recursive: true })
}

export function loadPersonalPeaks(id: number): Promise<PeaksCache> {
	return loadPeaksAt(personalFilePath(id), `${PERSONAL_SUBDIR}/${id}.peaks.json`)
}

/** Fichier et cache de forme d'onde. Un fichier déjà absent n'est pas une erreur. */
export async function removePersonalFiles(id: number): Promise<void> {
	await unlink(personalAudioPath(id)).catch(() => {})
	await unlink(join(audioDir(), PERSONAL_SUBDIR, `${id}.peaks.json`)).catch(() => {})
}

/** Où l'enregistrement est publié : c'est ce que son propriétaire doit voir d'un coup d'œil. */
export type PersonalPublication = { post_id: number; group_id: number; group_name: string }

export type PersonalRecordingView = PersonalRecording & {
	publications: PersonalPublication[]
	/** Commentaires reçus par ses publications : ce que sa suppression emporterait. */
	comment_count: number
}

const VIEW_COLUMNS = sql`
	pr.id, pr.user_id, pr.title, pr.notes, pr.file_path, pr.youtube_video_id, pr.youtube_title,
	pr.source_file_name, pr.duration_s, pr.created_at, pr.updated_at,
	COALESCE(
		(
			SELECT json_agg(json_build_object('post_id', p.id, 'group_id', g.id, 'group_name', g.name) ORDER BY g.name)
			FROM posts p JOIN groups g ON g.id = p.group_id
			WHERE p.personal_recording_id = pr.id
		),
		'[]'::json
	) AS publications,
	(
		SELECT COUNT(*)::int FROM comments c
		JOIN posts p ON p.id = c.post_id
		WHERE p.personal_recording_id = pr.id
	) AS comment_count
`

export async function listPersonalRecordings(userId: number): Promise<PersonalRecordingView[]> {
	return (await sql<PersonalRecordingView[]>`
		SELECT ${VIEW_COLUMNS}
		FROM personal_recordings pr
		WHERE pr.user_id = ${userId}
		ORDER BY pr.created_at DESC, pr.id DESC
	`) as unknown as PersonalRecordingView[]
}

export async function getPersonalRecording(
	id: number,
	userId: number
): Promise<PersonalRecordingView | null> {
	const [row] = await sql<PersonalRecordingView[]>`
		SELECT ${VIEW_COLUMNS}
		FROM personal_recordings pr
		WHERE pr.id = ${id} AND pr.user_id = ${userId}
	`
	return row ?? null
}

/** Le même fichier déjà dans l'espace de l'utilisateur — et seulement le sien. */
export async function findPersonalDuplicate(
	userId: number,
	fileHash: string
): Promise<{ id: number; title: string } | null> {
	const [row] = await sql<{ id: number; title: string }[]>`
		SELECT id, title FROM personal_recordings
		WHERE user_id = ${userId} AND file_hash = ${fileHash}
		LIMIT 1
	`
	return row ?? null
}

/**
 * Droit d'écoute d'un fichier perso. Le propriétaire, toujours ; sinon un membre du
 * groupe actif si l'enregistrement y est publié. Le groupe actif est celui que
 * `hooks.server.ts` a validé contre les appartenances : il n'y a pas d'autre porte.
 */
export async function canListenPersonal(
	id: number,
	user: { id: number; current_group_id: number | null }
): Promise<boolean> {
	const [row] = await sql`
		SELECT 1
		FROM personal_recordings pr
		WHERE pr.id = ${id}
		  AND pr.file_path IS NOT NULL
		  AND (
			pr.user_id = ${user.id}
			OR EXISTS (
				SELECT 1 FROM posts p
				WHERE p.personal_recording_id = pr.id AND p.group_id = ${user.current_group_id}
			)
		  )
	`
	return !!row
}

/**
 * Supprime l'enregistrement ; ses publications, leurs commentaires et notifications
 * tombent en cascade. Les fichiers partent après : un fichier orphelin se rattrape,
 * une ligne pointant vers un fichier absent non.
 */
export async function deletePersonalRecording(id: number, userId: number): Promise<boolean> {
	const [deleted] = await sql<{ id: number; file_path: string | null }[]>`
		DELETE FROM personal_recordings
		WHERE id = ${id} AND user_id = ${userId}
		RETURNING id, file_path
	`
	if (!deleted) return false
	if (deleted.file_path) await removePersonalFiles(id)
	return true
}

/** Ids des enregistrements perso d'un compte qui ont un fichier : à effacer avec lui. */
export async function personalFileIds(userId: number): Promise<number[]> {
	const rows = await sql<{ id: number }[]>`
		SELECT id FROM personal_recordings WHERE user_id = ${userId} AND file_path IS NOT NULL
	`
	return rows.map((row) => row.id)
}

/**
 * Titre saisi, ou à défaut le nom du fichier sans son extension : un enregistrement
 * sans titre ne se retrouverait pas dans la liste.
 */
export function normalizeTitle(raw: unknown, fallback: string | null): string | null {
	const typed = typeof raw === 'string' ? raw.trim() : ''
	const value = typed || (fallback ?? '').replace(/\.[a-z0-9]{2,5}$/i, '').trim()
	return value ? value.slice(0, PERSONAL_TITLE_MAX) : null
}

export function normalizeNotes(raw: unknown): string | null {
	if (typeof raw !== 'string') return null
	const value = raw.trim()
	return value ? value.slice(0, PERSONAL_NOTES_MAX) : null
}
