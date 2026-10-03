/**
 * Lecteur partagé de l'application.
 *
 * Un seul élément `<audio>` existe, monté par MiniPlayer dans le layout : il survit
 * donc à la navigation client. Les waveforms des pages ne possèdent pas leur audio,
 * elles s'y attachent comme de simples vues via l'option `media` de WaveSurfer, qui
 * ne met pas le média en pause quand la vue est détruite. Résultat : la lecture n'est
 * jamais coupée en changeant de page, et deux lecteurs ne peuvent pas jouer ensemble.
 */

import { untrack } from 'svelte'

export type PlayerTrack = {
	recordingId: number
	songId: number
	songTitle: string
	take: number
	sessionDate: string | null
	durationS: number | null
}

export function audioUrl(recordingId: number): string {
	return `/audio/${recordingId}.mp3`
}

class SharedPlayer {
	track = $state<PlayerTrack | null>(null)
	media = $state<HTMLAudioElement | null>(null)
	isPlaying = $state(false)
	currentTime = $state(0)
	duration = $state(0)

	// Prises à enchaîner après celle en cours (« tout écouter » d'un morceau). Vide
	// hors de ce cas : une prise lancée seule remplace la file au lieu de s'y ajouter.
	queue = $state<PlayerTrack[]>([])

	// Nombre de waveforms montées sur le média partagé. Tant qu'il y en a une, la barre
	// du bas reste masquée : elle ferait doublon avec les contrôles déjà à l'écran.
	viewCount = $state(0)

	/**
	 * Charge une prise. Si c'est déjà la piste en cours, le `src` n'est pas retouché :
	 * la lecture continue là où elle en est (cas du retour sur une page qui la porte).
	 */
	load(next: PlayerTrack, autoplay = false) {
		if (this.track?.recordingId !== next.recordingId) this.queue = []
		this.#setTrack(next, autoplay)
	}

	/** Lance la première prise et garde les suivantes en file. */
	playAll(tracks: PlayerTrack[]) {
		if (tracks.length === 0) return
		this.#setTrack(tracks[0], true)
		this.queue = tracks.slice(1)
	}

	/** ▶ d'une ligne de prise : met en pause celle qui joue, lance les autres. */
	toggleTrack(next: PlayerTrack) {
		if (this.track?.recordingId === next.recordingId) this.toggle()
		else this.load(next, true)
	}

	next() {
		const [following, ...rest] = this.queue
		if (!following) return
		this.#setTrack(following, true)
		this.queue = rest
	}

	/**
	 * Fin de piste. On n'enchaîne que si aucune waveform n'est montée : la page d'une
	 * prise dessine sa propre forme d'onde, et y charger la suivante la laisserait
	 * afficher une autre prise que celle qu'on entend.
	 */
	handleEnded() {
		this.isPlaying = false
		if (this.viewCount === 0) this.next()
		else this.queue = []
	}

	#setTrack(next: PlayerTrack, autoplay: boolean) {
		const isNew = this.track?.recordingId !== next.recordingId
		this.track = next

		if (isNew) {
			this.currentTime = 0
			this.duration = next.durationS ?? 0
			if (this.media) this.media.src = audioUrl(next.recordingId)
		}

		if (autoplay) this.play()
	}

	/**
	 * Le fichier d'une prise a changé sous la même adresse (son amélioré, ou rendu à
	 * l'original) : on le recharge, à la même position et dans le même état de lecture.
	 * Réaffecter `src`, même identique, relance le chargement.
	 */
	reload(recordingId: number) {
		const media = this.media
		if (!media || this.track?.recordingId !== recordingId) return
		const at = media.currentTime
		const wasPlaying = !media.paused
		media.addEventListener(
			'loadedmetadata',
			() => {
				media.currentTime = at
				if (wasPlaying) this.play()
			},
			{ once: true }
		)
		media.src = audioUrl(recordingId)
	}

	play() {
		this.media?.play().catch(() => {})
	}

	pause() {
		this.media?.pause()
	}

	toggle() {
		if (!this.media) return
		if (this.media.paused) this.play()
		else this.pause()
	}

	seek(seconds: number) {
		if (!this.media || !isFinite(seconds)) return
		const duration = Number.isFinite(this.duration) && this.duration > 0 ? this.duration : Infinity
		const time = Math.max(0, Math.min(seconds, duration))
		// `timeupdate` n'est pas immédiat après un seek : mettre aussi le store à jour
		// évite que l'indicateur affiche brièvement l'ancienne position.
		this.currentTime = time
		this.media.currentTime = time
	}

	/** Ferme la barre et libère le média. */
	close() {
		this.pause()
		this.track = null
		this.queue = []
		this.isPlaying = false
		this.currentTime = 0
		this.duration = 0
		if (this.media) {
			this.media.removeAttribute('src')
			this.media.load()
		}
	}

	// Ces deux méthodes sont appelées depuis un `$effect`. Sans `untrack`, la lecture
	// de `viewCount` y serait suivie et l'écriture ré-invaliderait l'effet en boucle
	// (effect_update_depth_exceeded), ce qui casse tout l'arbre d'effets de la page.
	attachView() {
		untrack(() => { this.viewCount += 1 })
	}

	detachView() {
		untrack(() => { this.viewCount = Math.max(0, this.viewCount - 1) })
	}
}

export const player = new SharedPlayer()
