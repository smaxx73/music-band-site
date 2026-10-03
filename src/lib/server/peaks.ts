import { readFile, unlink, writeFile } from 'fs/promises'
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

/** Oublie la forme d'onde d'une prise dont le son a changé : elle se refera au prochain affichage. */
export async function forgetPeaks(recordingId: number): Promise<void> {
	await unlink(join(audioDir(), `${recordingId}.peaks.json`)).catch(() => {})
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
		// Les liens sont préchargés au survol : survoler puis cliquer une prise jamais
		// affichée demanderait deux fois la même extraction, en même temps.
		let pending = extracting.get(cacheName)
		if (!pending) {
			pending = extract(join(dir, filePath), peaksPath).finally(() => extracting.delete(cacheName))
			extracting.set(cacheName, pending)
		}
		return pending
	}
}

const extracting = new Map<string, Promise<PeaksCache>>()

async function extract(fullPath: string, peaksPath: string): Promise<PeaksCache> {
	const [peaks, duration] = await Promise.all([
		extractPeaks(fullPath),
		getDuration(fullPath)
	])
	if (peaks.length > 0) await writeFile(peaksPath, JSON.stringify({ peaks, duration })).catch(() => {})
	return { peaks, duration }
}
