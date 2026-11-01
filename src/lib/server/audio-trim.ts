import { createHash, randomUUID } from 'crypto'
import { copyFile, rename, unlink } from 'fs/promises'
import sql from './db'
import { discardPreviews } from './audio-enhance'
import { convertToMp3, getDuration, getExactDuration } from './ffmpeg'
import { cutPartPaths, joinFiles, splitMp3 } from './mp3-cut'
import { forgetPeaks } from './peaks'
import { audioPath } from './storage'
import type { AudioTrim } from '$lib/types'

/** Les bornes sont facultatives pour les dépôts ordinaires, mais toujours validées avant ffmpeg. */
export async function readAudioTrim(
	fields: Record<string, string>,
	inputPath: string
): Promise<{ trim: AudioTrim | null; error: string | null }> {
	const hasStart = fields.trim_start !== undefined
	const hasEnd = fields.trim_end !== undefined
	if (!hasStart && !hasEnd) return { trim: null, error: null }
	if (!hasStart || !hasEnd) return { trim: null, error: 'Bornes de coupe incomplètes.' }
	const startS = Number(fields.trim_start)
	const endS = Number(fields.trim_end)
	if (!Number.isFinite(startS) || !Number.isFinite(endS) || startS < 0 || endS - startS < 0.25) {
		return { trim: null, error: 'Bornes de coupe invalides.' }
	}
	const duration = await getExactDuration(inputPath)
	// Certains WebM de MediaRecorder n'annoncent aucune durée dans leur conteneur.
	// ffmpeg saura tout de même les parcourir jusqu'à la borne demandée.
	if (duration !== null && (startS >= duration || endS > duration + 0.5)) {
		return { trim: null, error: 'La coupe dépasse la durée du fichier audio.' }
	}
	return { trim: { startS, endS: duration === null ? endS : Math.min(endS, duration) }, error: null }
}

/** Deux coupes différentes du même original doivent pouvoir devenir deux prises. */
export function hashWithTrim(sourceHash: string, trim: AudioTrim | null): string {
	return trim
		? createHash('sha256').update(`${sourceHash}:${trim.startS.toFixed(3)}:${trim.endS.toFixed(3)}`).digest('hex')
		: sourceHash
}

/** Contrôle le résultat quand la source (notamment WebM) ne déclarait pas sa durée. */
export async function assertTrimmedAudio(outputPath: string, trim: AudioTrim | null): Promise<void> {
	if (!trim) return
	const duration = await getExactDuration(outputPath)
	if (duration === null || duration < 0.25) {
		throw Object.assign(new Error('La coupe ne contient pas de son.'), { code: 'invalid_trim' })
	}
}

/**
 * Convertit tout le fichier déposé, puis le coupe sur ses octets : `keptPath` ne porte que le
 * passage choisi, et ce qui l'entoure attend à côté (`cutPartPaths`), jusqu'à `keepCutParts`.
 * Rien n'est dupliqué ni réencodé : recollés, les trois redonnent le fichier entier.
 * Rend les bornes réelles, posées sur des trames, dans le temps du fichier entier.
 */
export async function convertWithCut(rawPath: string, keptPath: string, trim: AudioTrim): Promise<AudioTrim> {
	const wholePath = `${keptPath}.whole`
	try {
		await convertToMp3(rawPath, wholePath, { keepSilence: true })
		return await splitMp3(wholePath, trim, keptPath)
	} finally {
		await unlink(wholePath).catch(() => {})
	}
}

/** Pose ce qui entoure le passage à côté de son mp3 définitif : `/tmp` et AUDIO_DIR sont distincts, on copie. */
export async function keepCutParts(keptTmpPath: string, mp3Path: string): Promise<void> {
	const from = cutPartPaths(keptTmpPath)
	const to = cutPartPaths(mp3Path)
	await copyFile(from.head, to.head)
	await copyFile(from.tail, to.tail)
	await discardCutParts(keptTmpPath)
}

export async function discardCutParts(mp3Path: string): Promise<void> {
	const { head, tail } = cutPartPaths(mp3Path)
	await unlink(head).catch(() => {})
	await unlink(tail).catch(() => {})
}

export type RestoreOutcome = { ok: true } | { ok: false; status: number; error: string }

/** Recolle le fichier entier à côté de celui qu'il va remplacer (`rename` atomique ensuite). */
export async function rejoinWholeFile(mp3Path: string): Promise<{ stagedPath: string; durationS: number | null }> {
	const stagedPath = `${mp3Path}.${randomUUID()}.part`
	const { head, tail } = cutPartPaths(mp3Path)
	try {
		await joinFiles([head, mp3Path, tail], stagedPath)
		return { stagedPath, durationS: await getDuration(stagedPath) }
	} catch (err) {
		await unlink(stagedPath).catch(() => {})
		throw err
	}
}

/**
 * Défait le recadrage d'une prise. Réservé au déposant et aux admins : à vérifier avant l'appel.
 * Une position du passage vaut `position + trim_start_s` dans le fichier entier : c'est ce qui
 * garde les repères des commentaires sur les mêmes notes.
 */
export async function restoreWholeRecording(id: number): Promise<RestoreOutcome> {
	const [current] = await sql<{ trim_start_s: number | null; enhanced_at: Date | null }[]>`
		SELECT trim_start_s, enhanced_at FROM recordings WHERE id = ${id}
	`
	if (!current || current.trim_start_s === null) return { ok: false, status: 409, error: "Cette prise n'est pas recadrée." }
	// `{id}.mp3` doit être le passage tel que coupé : la version améliorée ne se recolle pas
	// aux deux autres morceaux, l'original seul le peut.
	if (current.enhanced_at) return { ok: false, status: 409, error: "Reviens d'abord à l'original du son amélioré." }

	const { stagedPath, durationS } = await rejoinWholeFile(audioPath(id))
	try {
		const outcome: RestoreOutcome = await sql.begin(async (tx) => {
			// Un double envoi, ou une amélioration gardée entre-temps.
			const [row] = await tx<{ trim_start_s: number | null; enhanced_at: Date | null }[]>`
				SELECT trim_start_s, enhanced_at FROM recordings WHERE id = ${id} FOR UPDATE
			`
			if (!row || row.trim_start_s === null) return { ok: false as const, status: 409, error: "Cette prise n'est pas recadrée." }
			if (row.enhanced_at) return { ok: false as const, status: 409, error: "Reviens d'abord à l'original du son amélioré." }

			await tx`
				UPDATE comments SET timestamp_s = timestamp_s + ${row.trim_start_s}
				WHERE recording_id = ${id} AND timestamp_s IS NOT NULL
			`
			await tx`
				UPDATE recordings
				SET duration_s = ${durationS}, file_hash = source_file_hash, audio_analysis = NULL,
				    trim_start_s = NULL, trim_end_s = NULL, source_file_hash = NULL
				WHERE id = ${id}
			`
			await rename(stagedPath, audioPath(id))
			return { ok: true as const }
		})
		if (outcome.ok) {
			await discardCutParts(audioPath(id))
			await forgetPeaks(id)
			await discardPreviews(id)
		}
		return outcome
	} finally {
		await unlink(stagedPath).catch(() => {})
	}
}
