import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import { copyFile, unlink } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import sql from '$lib/server/db'
import { extractSegment, getDuration } from '$lib/server/ffmpeg'
import { audioPath, ensureAudioDir, hashFile } from '$lib/server/storage'
import { claimImport, discardImport, loadImport, releaseImport, sourcePath } from '$lib/server/imports'
import { notifyGroup } from '$lib/server/notifications'
import type { Recording } from '$lib/types'

/** Un segment plus court n'est pas une prise : la découpe est refusée. */
const MIN_SLICE_S = 1

type SegmentInput = { start_s: number; end_s: number; song_id: number }

type PreparedSlice = {
	tmpPath: string
	songId: number
	durationS: number | null
	hash: string
}

/**
 * Transforme un import en prises : un extrait par segment retenu, chacun rattaché au
 * morceau choisi. Les segments écartés à l'écran ne sont simplement pas envoyés.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const groupId = locals.user.current_group_id
	const author = locals.user.display_name
	const userId = locals.user.id

	const audioImport = await loadImport(userId, groupId, params.id)
	if (!audioImport) return json({ error: 'Import introuvable.' }, { status: 404 })

	const body = await request.json().catch(() => null)
	if (!body || typeof body !== 'object') {
		return json({ error: 'Corps de requête invalide.' }, { status: 400 })
	}

	const sessionId = Number((body as { session_id?: unknown }).session_id ?? audioImport.session_id)
	if (!Number.isInteger(sessionId) || sessionId <= 0) {
		return json({ error: 'session_id manquant ou invalide.' }, { status: 400 })
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
		const songId = Number((raw as SegmentInput)?.song_id)

		if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end - start < MIN_SLICE_S) {
			return json({ error: 'Bornes de segment invalides.' }, { status: 400 })
		}
		if (audioImport.duration_s !== null && start >= audioImport.duration_s) {
			return json({ error: 'Segment hors du fichier.' }, { status: 400 })
		}
		if (!Number.isInteger(songId) || songId <= 0) {
			return json({ error: 'Chaque segment doit être rattaché à un morceau.' }, { status: 400 })
		}
		segments.push({ start_s: start, end_s: end, song_id: songId })
	}
	segments.sort((a, b) => a.start_s - b.start_s)

	const [session] = await sql`
		SELECT id FROM sessions WHERE id = ${sessionId} AND group_id = ${groupId}
	`
	if (!session) return json({ error: 'Session introuvable.' }, { status: 404 })

	const songs = await sql<{ id: number; title: string }[]>`
		SELECT id, title FROM songs WHERE group_id = ${groupId}
	`
	const titles = new Map(songs.map((s) => [s.id, s.title]))
	if (segments.some((segment) => !titles.has(segment.song_id))) {
		return json({ error: 'Morceau introuvable dans le groupe actif.' }, { status: 404 })
	}

	// Réclamer l'import avant tout travail : un double envoi ne doit pas créer
	// deux séries de prises à partir du même fichier.
	if (!(await claimImport(userId, groupId, audioImport.id))) {
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
				songId: segment.song_id,
				durationS: await getDuration(tmpPath),
				hash: await hashFile(tmpPath)
			})
		}

		// 2. Takes et insertions dans une seule transaction : les segments d'un même
		//    morceau se numérotent alors à la suite, sans trou ni collision.
		const created = (await sql.begin(async (tx) => {
			const rows: (Recording & { song_title: string })[] = []
			for (const slice of prepared) {
				const [{ take }] = await tx<{ take: number }[]>`
					SELECT COALESCE(MAX(take), 0) + 1 AS take
					FROM recordings
					WHERE session_id = ${sessionId} AND song_id = ${slice.songId}
				`
				const [row] = await tx<Recording[]>`
					INSERT INTO recordings (session_id, song_id, take, file_path, duration_s, uploaded_by, uploaded_by_user_id, file_hash)
					VALUES (${sessionId}, ${slice.songId}, ${take}, ${'pending'}, ${slice.durationS}, ${author}, ${userId}, ${slice.hash})
					RETURNING *
				`
				rows.push({ ...row, song_title: titles.get(slice.songId) ?? '' })
			}
			return rows
		})) as (Recording & { song_title: string })[]

		insertedIds = created.map((r) => r.id)

		// 3. Poser les fichiers et refermer `file_path`, comme à l'upload d'une prise.
		await ensureAudioDir()
		for (const [index, recording] of created.entries()) {
			await copyFile(prepared[index].tmpPath, audioPath(recording.id))
			await sql`UPDATE recordings SET file_path = ${`${recording.id}.mp3`} WHERE id = ${recording.id}`
			recording.file_path = `${recording.id}.mp3`
		}

		// 4. L'import a fait son office : ligne et octets s'en vont. Hors du chemin
		//    d'annulation — les prises sont bonnes, un reste de transit se balaye seul.
		await discardImport(audioImport.id).catch((err) => console.error('[imports] purge', err))

		for (const recording of created) {
			await notifyGroup({
				groupId,
				actor: { id: userId, display_name: author },
				type: 'recording',
				subject: recording.song_title,
				excerpt: `Prise ${recording.take}`,
				link: `/recording/${recording.id}`,
				recordingId: recording.id,
				sessionId
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
