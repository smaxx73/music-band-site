/**
 * Ce qui vaut une écoute d'une prise : du temps réellement lu, pas une requête du
 * fichier. Le navigateur précharge, découpe le fichier en plages et se déplace dedans :
 * côté serveur, une seule écoute ressemble à dix, et un survol à une écoute.
 *
 * Partagé par le lecteur (`player.svelte.ts`) et les tests.
 */

/** Temps lu qui fait une écoute : de quoi avoir entendu la prise, pas seulement l'avoir lancée. */
export const LISTEN_MIN_S = 30

/** Une prise plus courte que deux fois le seuil compte à mi-parcours. */
export const LISTEN_MIN_SHARE = 0.5

// `timeupdate` arrive toutes les 250 ms environ, un peu moins souvent dans un onglet en
// arrière-plan. Un écart plus grand est un déplacement dans le morceau (⏭ +10 s, clic
// sur la forme d'onde), pas du temps écouté.
const MAX_STEP_S = 2

export function listenThreshold(durationS: number | null | undefined): number {
	if (!durationS || !Number.isFinite(durationS) || durationS <= 0) return LISTEN_MIN_S
	return Math.min(LISTEN_MIN_S, durationS * LISTEN_MIN_SHARE)
}

export class ListenMeter {
	#listened = 0
	#last: number | null = null
	#counted = false

	/**
	 * Position du lecteur pendant la lecture. Rend `true` une seule fois, au moment où le
	 * temps lu atteint le seuil ; ensuite plus rien jusqu'à `reset()`.
	 */
	advance(time: number, durationS: number | null | undefined): boolean {
		const last = this.#last
		this.#last = time
		if (this.#counted || last === null) return false
		const step = time - last
		if (step > 0 && step <= MAX_STEP_S) this.#listened += step
		if (this.#listened < listenThreshold(durationS)) return false
		this.#counted = true
		return true
	}

	/** Lecture interrompue (pause) : la reprise ne compte pas l'écart avec l'ancienne position. */
	pause() {
		this.#last = null
	}

	/** Autre piste, ou fin de celle-ci : une nouvelle lecture peut refaire une écoute. */
	reset() {
		this.#listened = 0
		this.#last = null
		this.#counted = false
	}
}
