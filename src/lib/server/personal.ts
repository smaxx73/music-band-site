import { copyFile, mkdir, unlink } from 'fs/promises'
import { join } from 'path'
import sql from './db'
import { audioDir } from './config'
import { audioPath, ensureAudioDir, totalFileSize } from './storage'
import { loadPeaksAt, type PeaksCache } from './peaks'
import type { PersonalRecording, Recording } from '$lib/types'

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
	pr.source_file_name, pr.duration_s, pr.file_hash, pr.created_at, pr.updated_at,
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

/** Place occupée sur le disque par l'espace perso d'un compte (pistes audio). */
export async function personalAudioBytes(userId: number): Promise<number> {
	const ids = await personalFileIds(userId)
	return totalFileSize(ids.map(personalAudioPath))
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

/** Un passage déjà taillé dans l'original d'un import, prêt à entrer dans l'espace perso. */
export type PersonalSlice = {
	tmpPath: string
	title: string
	durationS: number | null
	hash: string
}

/**
 * Fait des passages d'une découpe autant d'enregistrements perso. Les lignes naissent
 * ensemble, dans une transaction ; les fichiers sont posés ensuite, comme à l'upload.
 * Si quoi que ce soit échoue, lignes et fichiers déjà posés repartent : rien ne reste à
 * moitié fait, et l'appelant rouvre l'import.
 */
export async function createPersonalFromSlices(opts: {
	userId: number
	sourceFileName: string
	slices: PersonalSlice[]
}): Promise<number[]> {
	const { userId, sourceFileName, slices } = opts
	let ids: number[] = []
	try {
		ids = await sql.begin(async (tx) => {
			const created: number[] = []
			for (const slice of slices) {
				// Tous portent le nom du fichier découpé : ils viennent réellement du même
				// enregistrement, et c'est ce qu'on cherche à retrouver plus tard.
				const [row] = await tx<{ id: number }[]>`
					INSERT INTO personal_recordings (user_id, title, file_path, source_file_name, duration_s, file_hash)
					VALUES (${userId}, ${slice.title}, ${'pending'}, ${sourceFileName}, ${slice.durationS}, ${slice.hash})
					RETURNING id
				`
				created.push(row.id)
			}
			return created
		})

		await ensurePersonalDir()
		for (const [index, id] of ids.entries()) {
			await copyFile(slices[index].tmpPath, personalAudioPath(id))
			await sql`UPDATE personal_recordings SET file_path = ${personalFilePath(id)} WHERE id = ${id}`
		}
		return ids
	} catch (err) {
		for (const id of ids) {
			await unlink(personalAudioPath(id)).catch(() => {})
			await sql`DELETE FROM personal_recordings WHERE id = ${id} AND user_id = ${userId}`.catch(() => {})
		}
		throw err
	}
}

/**
 * Fait d'un enregistrement perso une prise du groupe : le carnet sert justement à capter
 * ce qu'on n'a pas eu le temps de classer — la session oubliée, l'idée venue seule. Le son
 * ne se copie pas, il **déménage** : le fichier passe dans `AUDIO_DIR`, la ligne perso
 * disparaît, et avec elle ses publications (l'appelant l'annonce avant de valider).
 */
export type ClassifyResult =
	| { ok: true; recording: Recording; song_title: string }
	| { ok: false; status: number; error: string; duplicate?: unknown }

export async function classifyPersonalRecording(opts: {
	id: number
	userId: number
	groupId: number
	sessionId: number
	songId: number
	author: string
}): Promise<ClassifyResult> {
	const { id, userId, groupId, sessionId, songId, author } = opts

	const source = await getPersonalRecording(id, userId)
	if (!source) return { ok: false, status: 404, error: 'Enregistrement introuvable.' }

	// Le même son déjà déposé comme prise du groupe : le dire plutôt que de le doubler,
	// comme à l'upload.
	if (source.file_hash) {
		const [duplicate] = await sql`
			SELECT r.id, r.take, ses.date AS session_date, s.title AS song_title
			FROM recordings r
			JOIN sessions ses ON ses.id = r.session_id
			JOIN songs s ON s.id = r.song_id
			WHERE r.file_hash = ${source.file_hash} AND ses.group_id = ${groupId}
		`
		if (duplicate) return { ok: false, status: 409, error: 'doublon', duplicate }
	}

	// Le fichier est copié dans la transaction, avant le point de non-retour : un échec
	// laisse l'enregistrement perso entier, et la copie inachevée est effacée.
	// Une prise n'a pas de titre — elle s'appelle « morceau, prise n ». Celui de
	// l'enregistrement perso finit donc dans la note, plutôt que d'être perdu.
	const takeNotes = [source.title, source.notes].filter(Boolean).join(' — ') || null

	let copied: string | null = null
	try {
		const outcome: ClassifyResult = await sql.begin(async (tx) => {
			const [song] = await tx<{ id: number; title: string; status: string }[]>`
				SELECT id, title, status FROM songs
				WHERE id = ${songId} AND group_id = ${groupId}
				FOR UPDATE
			`
			if (!song) return { ok: false as const, status: 404, error: 'Morceau introuvable.' }
			if (song.status === 'abandonne') {
				return { ok: false as const, status: 400, error: 'Ce morceau est abandonné.' }
			}

			const [session] = await tx`
				SELECT id FROM sessions WHERE id = ${sessionId} AND group_id = ${groupId}
			`
			if (!session) return { ok: false as const, status: 404, error: 'Session introuvable.' }

			const [{ take }] = await tx<{ take: number }[]>`
				SELECT COALESCE(MAX(take), 0) + 1 AS take FROM recordings WHERE song_id = ${songId}
			`

			const [created] = await tx<Recording[]>`
				INSERT INTO recordings (
					session_id, song_id, take, file_path, source_file_name, duration_s,
					uploaded_by, uploaded_by_user_id, file_hash, youtube_video_id, youtube_title, notes
				)
				VALUES (
					${sessionId}, ${songId}, ${take},
					${source.file_path ? 'pending' : null},
					${source.source_file_name}, ${source.duration_s},
					${author}, ${userId}, ${source.file_hash},
					${source.youtube_video_id}, ${source.youtube_title},
					${takeNotes}
				)
				RETURNING *
			`

			let filePath: string | null = null
			if (source.file_path) {
				await ensureAudioDir()
				copied = audioPath(created.id)
				await copyFile(personalAudioPath(id), copied)
				filePath = `${created.id}.mp3`
				await tx`UPDATE recordings SET file_path = ${filePath} WHERE id = ${created.id}`
			}

			// Ses liens d'écoute publics suivent le son : un lien déjà envoyé au dehors
			// continue d'ouvrir le même enregistrement, devenu prise. Désormais au groupe,
			// ils se gèrent comme ceux de toute prise, par tout membre.
			await tx`
				UPDATE share_links SET recording_id = ${created.id}, personal_recording_id = NULL
				WHERE personal_recording_id = ${id}
			`

			// Ses publications et leurs commentaires tombent en cascade : l'enregistrement
			// a changé de place, il n'est plus là pour les porter.
			await tx`DELETE FROM personal_recordings WHERE id = ${id} AND user_id = ${userId}`

			return {
				ok: true as const,
				recording: { ...created, file_path: filePath },
				song_title: song.title
			}
		})

		if (!outcome.ok && copied) {
			await unlink(copied).catch(() => {})
			return outcome
		}
		// Les octets d'origine ne partent qu'une fois la prise acquise.
		if (outcome.ok && source.file_path) await removePersonalFiles(id)
		return outcome
	} catch (err) {
		if (copied) await unlink(copied).catch(() => {})
		throw err
	}
}
