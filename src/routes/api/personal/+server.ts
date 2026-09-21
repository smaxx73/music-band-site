import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import { copyFile, unlink } from 'fs/promises'
import sql from '$lib/server/db'
import { convertToMp3, getDuration } from '$lib/server/ffmpeg'
import {
	allowedAudioMime,
	cleanSourceFileName,
	MAX_UPLOAD_SIZE,
	receiveMultipartAudio
} from '$lib/server/upload-stream'
import {
	ensurePersonalDir,
	findPersonalDuplicate,
	getPersonalRecording,
	listPersonalRecordings,
	normalizeNotes,
	normalizeTitle,
	personalAudioPath,
	personalFilePath
} from '$lib/server/personal'
import { fetchYouTubeVideoInfo } from '$lib/server/youtube'
import { parseYouTubeVideoId } from '$lib/youtube'

// L'espace perso n'est pas groupe-scopé : aucune de ces routes ne demande de groupe
// actif, et toutes filtrent sur le propriétaire.

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	return json(await listPersonalRecordings(locals.user.id))
}

/**
 * POST multipart — `audio`, `title?`, `notes?`, `youtube_url?`. Même chemin qu'une prise :
 * réception en flux, conversion mp3, durée ffprobe. Le doublon se cherche dans l'espace
 * de l'utilisateur seulement : ce que les autres ont déposé ne le regarde pas.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	const userId = locals.user.id

	const received = await receiveMultipartAudio(request, {
		allowedMime: await allowedAudioMime(),
		maxSize: MAX_UPLOAD_SIZE
	})
	if (!received.ok) return json({ error: received.error }, { status: received.status })

	const { tmpPath: rawTmpPath, hash: fileHash, fileName, fields } = received
	const sourceFileName = cleanSourceFileName(fileName)
	const mp3TmpPath = rawTmpPath + '.mp3'
	const discard = () => {
		unlink(rawTmpPath).catch(() => {})
		unlink(mp3TmpPath).catch(() => {})
	}

	const title = normalizeTitle(fields.title, sourceFileName)
	if (!title) {
		discard()
		return json({ error: 'Le titre est obligatoire.' }, { status: 400 })
	}

	let insertedId: number | null = null
	try {
		const duplicate = await findPersonalDuplicate(userId, fileHash)
		if (duplicate) {
			discard()
			return json(
				{ error: `Ce fichier est déjà dans ton espace : « ${duplicate.title} ».`, existing_id: duplicate.id },
				{ status: 409 }
			)
		}

		// Vidéo vérifiée avant la conversion, qui est la partie coûteuse.
		let video: { videoId: string; title: string | null } | null = null
		if (fields.youtube_url?.trim()) {
			const videoId = parseYouTubeVideoId(fields.youtube_url)
			if (!videoId) {
				discard()
				return json({ error: 'Lien YouTube non reconnu.' }, { status: 400 })
			}
			const info = await fetchYouTubeVideoInfo(videoId)
			if (!info.ok) {
				discard()
				return json({ error: info.error }, { status: 400 })
			}
			video = { videoId, title: info.title }
		}

		await convertToMp3(rawTmpPath, mp3TmpPath)
		await unlink(rawTmpPath).catch(() => {})
		const duration = await getDuration(mp3TmpPath)

		// Le chemin dépend de l'id : la ligne naît avec un chemin provisoire, corrigé une
		// fois le fichier posé — comme pour une prise.
		const [created] = await sql<{ id: number }[]>`
			INSERT INTO personal_recordings (
				user_id, title, notes, file_path, youtube_video_id, youtube_title,
				source_file_name, duration_s, file_hash
			)
			VALUES (
				${userId}, ${title}, ${normalizeNotes(fields.notes)}, ${'pending'}, ${video?.videoId ?? null},
				${video?.title ?? null}, ${sourceFileName}, ${duration}, ${fileHash}
			)
			RETURNING id
		`
		insertedId = created.id

		// /tmp et AUDIO_DIR sont sur des systèmes de fichiers distincts : copier, pas renommer.
		await ensurePersonalDir()
		await copyFile(mp3TmpPath, personalAudioPath(created.id))
		await unlink(mp3TmpPath).catch(() => {})
		await sql`UPDATE personal_recordings SET file_path = ${personalFilePath(created.id)} WHERE id = ${created.id}`

		return json(await getPersonalRecording(created.id, userId), { status: 201 })
	} catch (err) {
		discard()
		// Une ligne sans fichier ne doit pas survivre : elle promettrait une écoute impossible.
		if (insertedId !== null) {
			await sql`DELETE FROM personal_recordings WHERE id = ${insertedId}`.catch(() => {})
			await unlink(personalAudioPath(insertedId)).catch(() => {})
		}
		console.error('[personal]', err)
		return json({ error: "Erreur lors de l'envoi." }, { status: 500 })
	}
}
