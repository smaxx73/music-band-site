import { createHash } from 'crypto'
import { getExactDuration } from './ffmpeg'
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
