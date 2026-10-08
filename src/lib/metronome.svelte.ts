/**
 * Clic au tempo d'un morceau (feuille de répétition).
 *
 * Les clics sont programmés sur l'horloge de l'AudioContext, pas sur des minuteries :
 * `setInterval` dérive de plusieurs millisecondes par battement, ce qui s'entend aussitôt
 * dans un clic. Une minuterie ne fait que réveiller l'ordonnanceur, qui pose à l'avance
 * les clics des prochaines dizaines de millisecondes. Le témoin visuel suit la même
 * horloge, image par image : il s'allume au moment où le clic sort, pas quand il est posé.
 */

import { TEMPO_MAX_BPM, TEMPO_MIN_BPM } from '$lib/songs'

// Fréquence de réveil de l'ordonnanceur, et horizon des clics posés d'avance. Onglet en
// arrière-plan, le navigateur ne réveille plus qu'une fois par seconde : l'horizon
// s'allonge pour que le clic ne bégaie pas.
const WAKE_MS = 25
const AHEAD_S = 0.1
const AHEAD_HIDDEN_S = 1.5
// Durée pendant laquelle le témoin reste allumé après chaque battement.
const FLASH_S = 0.09

export class Metronome {
	/** Tempo de référence du morceau, où « ↺ » ramène. */
	readonly reference: number
	bpm = $state(0)
	running = $state(false)
	/** Vrai pendant l'éclair du témoin, à chaque battement. */
	lit = $state(false)

	#ctx: AudioContext | null = null
	// Un bus par lancement : l'arrêt le débranche, et les clics déjà posés d'avance se
	// taisent avec lui au lieu de sonner après « Arrêter ».
	#bus: GainNode | null = null
	#nextAt = 0
	#beats: number[] = []
	#timer: ReturnType<typeof setInterval> | null = null
	#frame = 0

	constructor(bpm: number) {
		this.reference = clampTempo(bpm)
		this.bpm = this.reference
	}

	/** À appeler dans le geste de l'utilisateur : sans lui, le navigateur garde l'audio muet. */
	async start() {
		if (this.running) return
		// Marqué tout de suite : un double toucher pendant le réveil de l'audio ne lance
		// pas deux clics superposés.
		this.running = true
		this.#ctx ??= new AudioContext()
		await this.#ctx.resume().catch(() => {})
		if (!this.running) return
		this.#bus = this.#ctx.createGain()
		this.#bus.connect(this.#ctx.destination)
		// Un léger délai : le premier clic ne tombe pas pendant le réveil de la sortie audio.
		this.#nextAt = this.#ctx.currentTime + 0.05
		this.#beats = []
		this.#schedule()
		this.#timer = setInterval(() => this.#schedule(), WAKE_MS)
		this.#frame = requestAnimationFrame(this.#draw)
	}

	stop() {
		if (!this.running) return
		this.running = false
		this.lit = false
		if (this.#timer) clearInterval(this.#timer)
		this.#timer = null
		cancelAnimationFrame(this.#frame)
		this.#bus?.disconnect()
		this.#bus = null
	}

	toggle() {
		if (this.running) this.stop()
		else void this.start()
	}

	/** Le changement prend effet au clic suivant, sans relancer : on règle en jouant. */
	nudge(delta: number) {
		this.bpm = clampTempo(this.bpm + delta)
	}

	reset() {
		this.bpm = this.reference
	}

	destroy() {
		this.stop()
		void this.#ctx?.close().catch(() => {})
		this.#ctx = null
	}

	#schedule() {
		const ctx = this.#ctx
		const bus = this.#bus
		if (!ctx || !bus) return
		const horizon = ctx.currentTime + (document.hidden ? AHEAD_HIDDEN_S : AHEAD_S)
		// Après une suspension (onglet gelé, veille), on repart de maintenant plutôt que de
		// rattraper d'un coup tous les clics manqués.
		if (this.#nextAt < ctx.currentTime) this.#nextAt = ctx.currentTime + 0.05
		while (this.#nextAt < horizon) {
			click(ctx, bus, this.#nextAt)
			this.#beats.push(this.#nextAt)
			this.#nextAt += 60 / this.bpm
		}
	}

	#draw = () => {
		const ctx = this.#ctx
		if (!ctx || !this.running) return
		// Ce qu'on entend a traversé la sortie audio : le témoin attend autant.
		const now = ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0)
		while (this.#beats.length > 1 && this.#beats[1] <= now) this.#beats.shift()
		const beat = this.#beats[0]
		const lit = beat !== undefined && now >= beat && now < beat + FLASH_S
		if (lit !== this.lit) this.lit = lit
		this.#frame = requestAnimationFrame(this.#draw)
	}
}

function clampTempo(bpm: number): number {
	return Math.min(TEMPO_MAX_BPM, Math.max(TEMPO_MIN_BPM, Math.round(bpm)))
}

// Un clic de bois sec plutôt qu'un bip : court, aigu, il passe au-dessus d'un groupe sans
// se confondre avec une note tenue.
function click(ctx: AudioContext, bus: AudioNode, at: number) {
	const osc = ctx.createOscillator()
	const gain = ctx.createGain()
	osc.type = 'square'
	osc.frequency.value = 1800
	gain.gain.setValueAtTime(0.0001, at)
	gain.gain.exponentialRampToValueAtTime(0.4, at + 0.001)
	gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.03)
	osc.connect(gain).connect(bus)
	osc.start(at)
	osc.stop(at + 0.04)
}
