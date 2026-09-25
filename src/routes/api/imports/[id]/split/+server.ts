import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import { copyFile, unlink } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import sql from '$lib/server/db'
import { extractSegment, getDuration } from '$lib/server/ffmpeg'
import { audioPath, ensureAudioDir, hashFile } from '$lib/server/storage'
import { claimImport, loadImport, releaseImport, sourcePath } from '$lib/server/imports'
import { notifyGroup } from '$lib/server/notifications'
import { createPersonalFromSlices, normalizeTitle } from '$lib/server/personal'
import { MIN_SEGMENT_LENGTH_S, type AudioImport, type Recording } from '$lib/types'

/** Un segment retenu : prise d'un morceau (import de groupe) ou titre (import perso). */
type SegmentInput = { start_s: number; end_s: number; song_id: number | null; title: string | null }

type PreparedSlice = {
	tmpPath: string
	segment: SegmentInput
	durationS: number | null
	hash: string
}

/**
 * Transforme un import en prises : un extrait par segment retenu, chacun rattaché au
 * morceau choisi. Les segments écartés à l'écran ne sont simplement pas envoyés.
 * Un import destiné à l'espace perso donne, lui, un enregistrement perso par segment,
 * sous le titre choisi.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })

	const author = locals.user.display_name
	const userId = locals.user.id

	const audioImport = await loadImport(locals.user, params.id)
	if (!audioImport) return json({ error: 'Import introuvable.' }, { status: 404 })
	// `loadImport` a vérifié qu'un import de groupe vise bien le groupe actif.
	const groupId = audioImport.group_id
	const personal = groupId === null

	const body = await request.json().catch(() => null)
	if (!body || typeof body !== 'object') {
		return json({ error: 'Corps de requête invalide.' }, { status: 400 })
	}

	const rawSegments = (body as { segments?: unknown }).segments
	if (!Array.isArray(rawSegments) || rawSegments.length === 0) {
		return json({ error: 'Aucun segment à découper.' }, { status: 400 })
	}

	// Validation complète avant le moindre appel à ffmpeg.
	const segments: SegmentInput[] = []
	for (const raw of rawSegments) {
		const start = Number((raw as SegmentInput)?.start_s)
		const end = Number((raw as SegmentInput)?.end_s)

		if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end - start < MIN_SEGMENT_LENGTH_S) {
			return json({ error: 'Bornes de segment invalides.' }, { status: 400 })
		}
		if (audioImport.duration_s !== null && start >= audioImport.duration_s) {
			return json({ error: 'Segment hors du fichier.' }, { status: 400 })
		}

		if (personal) {
			const title = normalizeTitle((raw as SegmentInput)?.title, null)
			if (!title) return json({ error: 'Chaque passage retenu doit avoir un titre.' }, { status: 400 })
			segments.push({ start_s: start, end_s: end, song_id: null, title })
		} else {
			const songId = Number((raw as SegmentInput)?.song_id)
			if (!Number.isInteger(songId) || songId <= 0) {
				return json({ error: 'Chaque segment doit être rattaché à un morceau.' }, { status: 400 })
			}
			segments.push({ start_s: start, end_s: end, song_id: songId, title: null })
		}
	}
	segments.sort((a, b) => a.start_s - b.start_s)

	let sessionId: number | null = null
	let titles = new Map<number, string>()
	if (!personal) {
		sessionId = Number((body as { session_id?: unknown }).session_id ?? audioImport.session_id)
		if (!Number.isInteger(sessionId) || sessionId <= 0) {
			return json({ error: 'session_id manquant ou invalide.' }, { status: 400 })
		}

		const [session] = await sql`
			SELECT id FROM sessions WHERE id = ${sessionId} AND group_id = ${groupId}
		`
		if (!session) return json({ error: 'Session introuvable.' }, { status: 404 })

		const songs = await sql<{ id: number; title: string }[]>`
			SELECT id, title FROM songs WHERE group_id = ${groupId}
		`
		titles = new Map(songs.map((s) => [s.id, s.title]))
		if (segments.some((segment) => !titles.has(segment.song_id!))) {
			return json({ error: 'Morceau introuvable dans le groupe actif.' }, { status: 404 })
		}
	}

	// Réclamer l'import avant tout travail : un double envoi ne doit pas créer
	// deux séries de prises à partir du même fichier.
	if (!(await claimImport(userId, audioImport.id))) {
		return json({ error: 'Découpe déjà effectuée.' }, { status: 409 })
	}

	const prepared: PreparedSlice[] = []
	let insertedIds: number[] = []

	try {
		// 1. Tailler les extraits à part, avant toute écriture en base : une ligne
		//    qui pointe vers un fichier absent est bien plus gênante que l'inverse.
		//    Dans l'ORIGINAL, pas dans le proxy : l'analyse s'est faite sur le fichier
		//    léger, le rendu part du fichier déposé.
		const source = sourcePath(audioImport.id)
		for (const [index, segment] of segments.entries()) {
			const tmpPath = join(tmpdir(), `band-slice-${audioImport.id}-${index}.mp3`)
			await extractSegment(source, tmpPath, segment.start_s, segment.end_s - segment.start_s)
			prepared.push({
				tmpPath,
				segment,
				durationS: await getDuration(tmpPath),
				hash: await hashFile(tmpPath)
			})
		}

		// L'import reste après validation : `claimImport` l'a marqué consommé, mais
		// l'original vit encore une semaine. S'apercevoir plus tard qu'un segment en
		// contenait deux ne doit pas obliger à renvoyer le fichier — voir `releaseImport`.

		if (personal) {
			// `createPersonalFromSlices` défait lui-même ce qu'il a commencé s'il échoue.
			const ids = await createPersonalFromSlices({
				userId,
				sourceFileName: audioImport.file_name,
				slices: prepared.map((slice) => ({ ...slice, title: slice.segment.title! }))
			})
			return json({ personal_recording_ids: ids }, { status: 201 })
		}

		const created = await createTakes(audioImport, groupId, sessionId!, prepared, titles, author, userId)
		insertedIds = created.map((r) => r.id)

		// 3. Poser les fichiers et refermer `file_path`, comme à l'upload d'une prise.
		await ensureAudioDir()
		for (const [index, recording] of created.entries()) {
			await copyFile(prepared[index].tmpPath, audioPath(recording.id))
			await sql`UPDATE recordings SET file_path = ${`${recording.id}.mp3`} WHERE id = ${recording.id}`
			recording.file_path = `${recording.id}.mp3`
		}

		for (const recording of created) {
			await notifyGroup({
				groupId,
				actor: { id: userId, display_name: author },
				type: 'recording',
				subject: recording.song_title,
				excerpt: `Prise ${recording.take}`,
				link: `/recording/${recording.id}`,
				recordingId: recording.id,
				sessionId: sessionId!
			})
		}

		return json(
			{
				session_id: sessionId,
				recordings: created.map(({ song_title, ...rest }) => rest)
			},
			{ status: 201 }
		)
	} catch (err) {
		console.error('[imports] découpe', err)

		// Rien ne doit rester à moitié fait : les prises déjà insérées repartent avec
		// leurs fichiers, et l'import redevient découpable.
		for (const id of insertedIds) {
			await unlink(audioPath(id)).catch(() => {})
			await sql`DELETE FROM recordings WHERE id = ${id}`.catch(() => {})
		}
		await releaseImport(audioImport.id)

		return json({ error: 'Erreur lors de la découpe.' }, { status: 500 })
	} finally {
		for (const slice of prepared) await unlink(slice.tmpPath).catch(() => {})
	}
}

/**
 * 2. Takes et insertions dans une seule transaction. Verrouiller les morceaux dans un
 *    ordre stable empêche deux ajouts simultanés de leur attribuer le même numéro, y
 *    compris si plusieurs morceaux sont découpés en parallèle.
 */
async function createTakes(
	audioImport: AudioImport,
	groupId: number,
	sessionId: number,
	prepared: PreparedSlice[],
	titles: Map<number, string>,
	author: string,
	userId: number
): Promise<(Recording & { song_title: string })[]> {
	return (await sql.begin(async (tx) => {
		const songIds = [...new Set(prepared.map((slice) => slice.segment.song_id!))].sort((a, b) => a - b)
		for (const songId of songIds) {
			await tx`
				SELECT id FROM songs
				WHERE id = ${songId} AND group_id = ${groupId}
				FOR UPDATE
			`
		}

		const rows: (Recording & { song_title: string })[] = []
		for (const slice of prepared) {
			const songId = slice.segment.song_id!
			const [{ take }] = await tx<{ take: number }[]>`
				SELECT COALESCE(MAX(take), 0) + 1 AS take
				FROM recordings
				WHERE song_id = ${songId}
			`
			// Toutes les prises d'une découpe portent le nom du fichier déposé : elles
			// viennent réellement du même enregistrement, et c'est ce que l'on cherche
			// à retrouver plus tard — pas le numéro du segment, que le take donne déjà.
			const [row] = await tx<Recording[]>`
				INSERT INTO recordings (session_id, song_id, take, file_path, source_file_name, duration_s, uploaded_by, uploaded_by_user_id, file_hash)
				VALUES (${sessionId}, ${songId}, ${take}, ${'pending'}, ${audioImport.file_name},
				        ${slice.durationS}, ${author}, ${userId}, ${slice.hash})
				RETURNING *
			`
			rows.push({ ...row, song_title: titles.get(songId) ?? '' })
		}
		return rows
	})) as (Recording & { song_title: string })[]
}
