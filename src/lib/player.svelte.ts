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

	// Nombre de waveforms montées sur le média partagé. Tant qu'il y en a une, la barre
	// du bas reste masquée : elle ferait doublon avec les contrôles déjà à l'écran.
	viewCount = $state(0)

	/**
	 * Charge une prise. Si c'est déjà la piste en cours, le `src` n'est pas retouché :
	 * la lecture continue là où elle en est (cas du retour sur une page qui la porte).
	 */
	load(next: PlayerTrack, autoplay = false) {
		const isNew = this.track?.recordingId !== next.recordingId
		this.track = next

		if (isNew) {
			this.currentTime = 0
			this.duration = next.durationS ?? 0
			if (this.media) this.media.src = audioUrl(next.recordingId)
		}

		if (autoplay) this.play()
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
		this.media.currentTime = Math.max(0, seconds)
	}

	/** Ferme la barre et libère le média. */
	close() {
		this.pause()
		this.track = null
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
