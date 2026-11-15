import type { AudioProfile } from '$lib/audio-enhance'

/**
 * Profil d'un fichier audio, pour le mode expert de l'amélioration du son : son spectre
 * par tiers d'octave, son bruit de fond, et la répartition de ses niveaux dans le temps.
 *
 * Le calcul se fait **au fil de l'eau** : les échantillons arrivent par blocs (ffmpeg les
 * décode, `measureProfile`), chaque fenêtre est transformée puis oubliée, et seuls des
 * cumuls et des histogrammes restent en mémoire — quelques kilo-octets, quelle que soit la
 * durée du fichier. Aucune dépendance : la transformée de Fourier tient en trente lignes.
 *
 * Le bruit de fond n'est pas « le niveau du silence » — une prise n'en a pas toujours, le
 * silence de début et de fin étant retiré à l'envoi. C'est, bande par bande, le niveau des
 * moments les plus calmes (statistique du minimum) : entre deux phrases, une bande ne
 * porte plus que le souffle, même si le morceau n'est jamais tout à fait muet.
 */

/** Fenêtre d'analyse : 186 ms à 44,1 kHz, soit 5,4 Hz par raie — de quoi séparer 20 et 25 Hz. */
const FFT_SIZE = 8192
/** Fenêtres réunies avant d'en lire le niveau calme : 0,74 s, pour lisser le hasard d'un bruit. */
const FRAMES_PER_BLOCK = 4
/** Tiers d'octave de 20 Hz à 20 kHz, centrés sur 1 kHz. */
const BAND_COUNT = 31
const FIRST_BAND = -17

/** Histogrammes par pas de 1 dB, de −140 à 0 dBFS. */
const HIST_FROM_DB = -140
const HIST_BINS = 141
/** Sous ce niveau, un bloc est du silence numérique, pas un passage calme. */
const DIGITAL_SILENCE_DB = -90

const NOISE_PERCENTILE = 0.1
const QUIET_PERCENTILE = 0.05
const LOUD_PERCENTILE = 0.95

/** Répartition des niveaux rendue à l'écran : de −70 à 0 dBFS. */
const LEVELS_FROM_DB = -70

export type Profiler = {
	/** Échantillons mono suivants, dans l'ordre. */
	push: (samples: Float32Array) => void
	/** `null` si le fichier est trop court ou muet. */
	finish: () => AudioProfile | null
}

export function createProfiler(sampleRate: number): Profiler {
	const window = hann(FFT_SIZE)
	// Énergie moyenne de la fenêtre : ce qu'elle retire au signal, à rendre à la mesure.
	const windowPower = window.reduce((sum, w) => sum + w * w, 0) / FFT_SIZE
	const bandOfBin = binBands(sampleRate)

	const frame = new Float32Array(FFT_SIZE)
	let filled = 0
	const re = new Float64Array(FFT_SIZE)
	const im = new Float64Array(FFT_SIZE)

	const meanPower = new Float64Array(BAND_COUNT)
	let frames = 0
	const blockPower = new Float64Array(BAND_COUNT)
	let blockFrames = 0
	const bandHist = Array.from({ length: BAND_COUNT }, () => new Uint32Array(HIST_BINS))
	const blockHist = new Uint32Array(HIST_BINS)
	const frameHist = new Uint32Array(HIST_BINS)

	function analyzeFrame() {
		for (let i = 0; i < FFT_SIZE; i++) {
			re[i] = frame[i] * window[i]
			im[i] = 0
		}
		fft(re, im)
		const bands = new Float64Array(BAND_COUNT)
		// Raies positives seulement, d'où le facteur 2 ; la somme des bandes vaut alors la
		// puissance moyenne du signal dans la fenêtre (Parseval).
		const scale = 2 / (FFT_SIZE * FFT_SIZE * windowPower)
		let total = 0
		for (let k = 1; k < FFT_SIZE / 2; k++) {
			const band = bandOfBin[k]
			if (band < 0) continue
			const power = (re[k] * re[k] + im[k] * im[k]) * scale
			bands[band] += power
			total += power
		}
		frames += 1
		frameHist[histBin(total)] += 1
		for (let b = 0; b < BAND_COUNT; b++) {
			meanPower[b] += bands[b]
			blockPower[b] += bands[b]
		}
		blockFrames += 1
		if (blockFrames === FRAMES_PER_BLOCK) closeBlock()
	}

	function closeBlock() {
		let total = 0
		for (let b = 0; b < BAND_COUNT; b++) total += blockPower[b] / blockFrames
		if (toDb(total) > DIGITAL_SILENCE_DB) {
			blockHist[histBin(total)] += 1
			for (let b = 0; b < BAND_COUNT; b++) bandHist[b][histBin(blockPower[b] / blockFrames)] += 1
		}
		blockPower.fill(0)
		blockFrames = 0
	}

	return {
		push(samples) {
			let offset = 0
			while (offset < samples.length) {
				const take = Math.min(FFT_SIZE - filled, samples.length - offset)
				frame.set(samples.subarray(offset, offset + take), filled)
				filled += take
				offset += take
				if (filled === FFT_SIZE) {
					analyzeFrame()
					filled = 0
				}
			}
		},
		finish() {
			if (blockFrames > 0) closeBlock()
			const blocks = blockHist.reduce((sum, n) => sum + n, 0)
			if (frames === 0 || blocks === 0) return null
			const shown = frameHist.subarray(LEVELS_FROM_DB - HIST_FROM_DB)
			return {
				freqs_hz: Array.from({ length: BAND_COUNT }, (_, b) => Math.round(bandCentre(b))),
				mean_db: Array.from(meanPower, (p) => round1(toDb(p / frames))),
				noise_db: bandHist.map((hist) => percentileDb(hist, NOISE_PERCENTILE)),
				quiet_db: percentileDb(blockHist, QUIET_PERCENTILE),
				loud_db: percentileDb(blockHist, LOUD_PERCENTILE),
				levels: Array.from(shown, (n) => Math.round((n / frames) * 10000) / 10000),
				levels_from_db: LEVELS_FROM_DB
			}
		}
	}
}

function bandCentre(band: number): number {
	return 1000 * 2 ** ((band + FIRST_BAND) / 3)
}

/** La bande de chaque raie, `-1` hors de 20 Hz – 20 kHz. */
function binBands(sampleRate: number): Int8Array {
	const bands = new Int8Array(FFT_SIZE / 2).fill(-1)
	const lowest = bandCentre(0) / 2 ** (1 / 6)
	for (let k = 1; k < FFT_SIZE / 2; k++) {
		const band = Math.floor(3 * Math.log2(((k * sampleRate) / FFT_SIZE) / lowest))
		if (band >= 0 && band < BAND_COUNT) bands[k] = band
	}
	return bands
}

function hann(size: number): Float64Array {
	return Float64Array.from({ length: size }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size))
}

function toDb(power: number): number {
	return power > 0 ? 10 * Math.log10(power) : -Infinity
}

function histBin(power: number): number {
	const db = toDb(power)
	return Math.min(HIST_BINS - 1, Math.max(0, Math.round(db - HIST_FROM_DB)))
}

/** Le niveau sous lequel se trouve cette part des blocs. */
function percentileDb(hist: Uint32Array, share: number): number {
	const total = hist.reduce((sum, n) => sum + n, 0)
	let seen = 0
	for (let i = 0; i < hist.length; i++) {
		seen += hist[i]
		if (seen >= total * share && seen > 0) return HIST_FROM_DB + i
	}
	return HIST_FROM_DB
}

function round1(value: number): number {
	return Number.isFinite(value) ? Math.round(value * 10) / 10 : HIST_FROM_DB
}

/** Transformée de Fourier rapide en place (taille puissance de 2). */
function fft(re: Float64Array, im: Float64Array): void {
	const n = re.length
	for (let i = 1, j = 0; i < n; i++) {
		let bit = n >> 1
		for (; j & bit; bit >>= 1) j ^= bit
		j ^= bit
		if (i < j) {
			const tr = re[i]; re[i] = re[j]; re[j] = tr
			const ti = im[i]; im[i] = im[j]; im[j] = ti
		}
	}
	for (let size = 2; size <= n; size <<= 1) {
		const half = size >> 1
		const angle = (-2 * Math.PI) / size
		const stepRe = Math.cos(angle)
		const stepIm = Math.sin(angle)
		for (let start = 0; start < n; start += size) {
			let wRe = 1
			let wIm = 0
			for (let k = 0; k < half; k++) {
				const a = start + k
				const b = a + half
				const tRe = re[b] * wRe - im[b] * wIm
				const tIm = re[b] * wIm + im[b] * wRe
				re[b] = re[a] - tRe
				im[b] = im[a] - tIm
				re[a] += tRe
				im[a] += tIm
				const next = wRe * stepRe - wIm * stepIm
				wIm = wRe * stepIm + wIm * stepRe
				wRe = next
			}
		}
	}
}
