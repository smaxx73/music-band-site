import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { audioDir } from '$lib/server/config'
import { extractPeaks, getDuration } from '$lib/server/ffmpeg'

export type PeaksCache = { peaks: number[]; duration: number | null }

/**
 * Les peaks sont coûteux à extraire (ffmpeg sur tout le fichier) : le résultat est
 * mis en cache à côté du mp3 et réutilisé par la page lecteur, la playlist et l'API.
 */
export function loadPeaks(recordingId: number, filePath: string): Promise<PeaksCache> {
	return loadPeaksAt(filePath, `${recordingId}.peaks.json`)
}

/**
 * Même cache pour tout mp3 d'AUDIO_DIR, prises comme enregistrements perso :
 * `filePath` et `cacheName` sont relatifs à AUDIO_DIR.
 */
export async function loadPeaksAt(filePath: string, cacheName: string): Promise<PeaksCache> {
	const dir = audioDir()
	const peaksPath = join(dir, cacheName)
	try {
		return JSON.parse(await readFile(peaksPath, 'utf-8')) as PeaksCache
	} catch {
		const fullPath = join(dir, filePath)
		const [peaks, duration] = await Promise.all([
			extractPeaks(fullPath),
			getDuration(fullPath)
		])
		if (peaks.length > 0) writeFile(peaksPath, JSON.stringify({ peaks, duration })).catch(() => {})
		return { peaks, duration }
	}
}
