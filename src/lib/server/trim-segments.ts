import type { AudioSegment, AudioTrim } from '$lib/types'

/**
 * Un recadrage suivi d'une découpe n'enlève rien au fichier : il dit seulement ce qui part
 * écarté sur l'écran de découpe, où un geste le reprend. Une borne coupe donc le segment qui
 * la chevauche, et ce qui tombe hors du passage gardé est marqué `outside_trim`.
 *
 * Ce qui est hors du passage garde les plus petits bouts que la détection a trouvés
 * (`detected` doit les contenir) : même trop courts pour faire une prise, ils ont été
 * écartés par un recadrage peut-être involontaire, et doivent rester à portée de main.
 * Dans le passage gardé, la règle reste celle de toute découpe (`minKeptS`).
 */
export function splitAtTrim(detected: AudioSegment[], trim: AudioTrim, minKeptS: number): AudioSegment[] {
	const parts: AudioSegment[] = []
	const push = (start_s: number, end_s: number, outside: boolean) => {
		if (end_s <= start_s) return
		if (!outside && end_s - start_s < minKeptS) return
		parts.push(outside ? { start_s, end_s, outside_trim: true } : { start_s, end_s })
	}
	for (const { start_s, end_s } of detected) {
		push(start_s, Math.min(end_s, trim.startS), true)
		push(Math.max(start_s, trim.startS), Math.min(end_s, trim.endS), false)
		push(Math.max(start_s, trim.endS), end_s, true)
	}
	return parts
}
