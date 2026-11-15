import type { EnhancePlan, EqBand } from '$lib/audio-enhance'

/**
 * Les courbes que le mode expert dessine : ce que la chaîne fait à chaque fréquence, et à
 * chaque niveau. Elles se calculent des réglages seuls, sans rendre le son — c'est ce qui
 * permet de voir l'effet d'un curseur avant de préparer un aperçu.
 *
 * Chaque formule est celle du filtre ffmpeg correspondant, vérifiée contre lui sur des
 * sinus : égaliseurs et coupe-bas à moins de 0,01 dB, compresseur sur sa courbe statique
 * (au-dessus du seuil, ffmpeg lit un sinus 2 dB plus fort que son niveau moyen : le
 * graphique montre la loi, pas la mesure d'un signal particulier).
 */

/** Fréquence d'échantillonnage des fichiers stockés, dont dépendent les filtres numériques. */
const SAMPLE_RATE = 44100
/** Largeur du genou d'`acompressor`, sa valeur par défaut (rapport de 2,83, soit ±4,5 dB). */
const COMPRESSOR_KNEE = 2.82843

type Biquad = { b0: number; b1: number; b2: number; a0: number; a1: number; a2: number }

/** Coefficients d'un filtre du second ordre (Audio EQ Cookbook), largeur donnée en Q. */
function biquad(type: EqBand['type'] | 'highpass', freqHz: number, q: number, gainDb: number): Biquad {
	const A = 10 ** (gainDb / 40)
	const w = (2 * Math.PI * freqHz) / SAMPLE_RATE
	const cos = Math.cos(w)
	const alpha = Math.sin(w) / (2 * q)
	const beta = 2 * Math.sqrt(A) * alpha
	switch (type) {
		case 'peak':
			return { b0: 1 + alpha * A, b1: -2 * cos, b2: 1 - alpha * A, a0: 1 + alpha / A, a1: -2 * cos, a2: 1 - alpha / A }
		case 'highpass':
			return { b0: (1 + cos) / 2, b1: -(1 + cos), b2: (1 + cos) / 2, a0: 1 + alpha, a1: -2 * cos, a2: 1 - alpha }
		case 'lowshelf':
			return {
				b0: A * (A + 1 - (A - 1) * cos + beta), b1: 2 * A * (A - 1 - (A + 1) * cos), b2: A * (A + 1 - (A - 1) * cos - beta),
				a0: A + 1 + (A - 1) * cos + beta, a1: -2 * (A - 1 + (A + 1) * cos), a2: A + 1 + (A - 1) * cos - beta
			}
		case 'highshelf':
			return {
				b0: A * (A + 1 + (A - 1) * cos + beta), b1: -2 * A * (A - 1 + (A + 1) * cos), b2: A * (A + 1 + (A - 1) * cos - beta),
				a0: A + 1 - (A - 1) * cos + beta, a1: 2 * (A - 1 - (A + 1) * cos), a2: A + 1 - (A - 1) * cos - beta
			}
	}
}

function magnitudeDb(k: Biquad, freqHz: number): number {
	const w = (2 * Math.PI * freqHz) / SAMPLE_RATE
	const c1 = Math.cos(w), s1 = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w)
	const numRe = k.b0 + k.b1 * c1 + k.b2 * c2
	const numIm = k.b1 * s1 + k.b2 * s2
	const denRe = k.a0 + k.a1 * c1 + k.a2 * c2
	const denIm = k.a1 * s1 + k.a2 * s2
	return 10 * Math.log10((numRe * numRe + numIm * numIm) / (denRe * denRe + denIm * denIm))
}

/** Gain d'une bande d'égalisation à une fréquence, en dB. */
export function bandGainDb(band: EqBand, freqHz: number): number {
	return magnitudeDb(biquad(band.type, band.freq_hz, band.q, band.gain_db), freqHz)
}

/** Gain du coupe-bas (deux pôles, Q de 0,707) à une fréquence, en dB. */
export function highpassGainDb(cutoffHz: number, freqHz: number): number {
	return magnitudeDb(biquad('highpass', cutoffHz, Math.SQRT1_2, 0), freqHz)
}

/**
 * Ce que la chaîne ajoute ou retire à chaque fréquence : coupe-bas, égalisation et grave.
 * Les gains d'ensemble (entrée, normalisation) n'y sont pas : ils déplacent tout le
 * spectre d'un bloc, sans en changer la forme.
 */
export function planResponseDb(plan: EnhancePlan, freqHz: number): number {
	let db = plan.highpass_hz ? highpassGainDb(plan.highpass_hz, freqHz) : 0
	for (const band of plan.eq) db += bandGainDb(band, freqHz)
	if (plan.bass_boost) db += bandGainDb(plan.bass_boost, freqHz)
	if (plan.bass_cut) db += bandGainDb(plan.bass_cut, freqHz)
	return db
}

/**
 * Niveau de sortie du compresseur pour un niveau d'entrée, en dB : sa courbe statique,
 * genou adouci compris. Sous le genou, le son sort comme il est entré.
 */
export function compressorOutDb(inDb: number, compressor: NonNullable<EnhancePlan['compressor']>): number {
	const halfKnee = 10 * Math.log10(COMPRESSOR_KNEE)
	const kneeStart = compressor.threshold_db - halfKnee
	const kneeStop = compressor.threshold_db + halfKnee
	if (inDb <= kneeStart) return inDb
	const slope = 1 / compressor.ratio
	const compressed = (level: number) => compressor.threshold_db + (level - compressor.threshold_db) * slope
	if (inDb >= kneeStop) return compressed(inDb)
	// Raccord en douceur (Hermite) entre la droite de pente 1 et celle de pente 1/taux.
	const width = kneeStop - kneeStart
	const t = (inDb - kneeStart) / width
	const p0 = kneeStart, p1 = compressed(kneeStop)
	const m0 = width, m1 = slope * width
	return (2 * p0 + m0 - 2 * p1 + m1) * t ** 3 + (-3 * p0 - 2 * m0 + 3 * p1 - m1) * t ** 2 + m0 * t + p0
}

/**
 * Niveau, dans une bande d'un tiers d'octave, d'un bruit blanc au seuil du débruiteur :
 * ce qui est sous cette droite est tenu pour du bruit et atténué, ce qui la dépasse de
 * 10 dB ne l'est presque plus (mesuré : pleine réduction dessous, les trois quarts sur la
 * droite, la moitié 5 dB au-dessus).
 */
export function denoiseThresholdDb(floorDb: number, bandCentreHz: number): number {
	const bandwidth = bandCentreHz * (2 ** (1 / 6) - 2 ** (-1 / 6))
	return floorDb + 10 * Math.log10(bandwidth / (SAMPLE_RATE / 2))
}
