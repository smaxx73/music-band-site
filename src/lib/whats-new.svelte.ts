import { APP_VERSION } from '$lib/version'
import { CHANGELOG } from '$lib/changelog'
import { entriesSince } from '$lib/changelog-parse'

// Dernière version dont ce navigateur a vu les nouveautés. Par navigateur et non par compte :
// un message de version ne vaut pas une table, et le revoir sur un autre appareil est sans mal.
const KEY = 'band_seen_version'

export const whatsNew = $state<{ seen: string | null; ready: boolean }>({ seen: null, ready: false })

/** Premier passage dans ce navigateur : rien à annoncer, on se place sur la version en service. */
export function loadSeen() {
	if (whatsNew.ready) return
	whatsNew.ready = true
	try {
		whatsNew.seen = localStorage.getItem(KEY)
	} catch {
		// Stockage refusé (navigation privée) : pas de bandeau plutôt qu'un bandeau à chaque page.
	}
	if (whatsNew.seen === null) markSeen()
}

export function markSeen() {
	whatsNew.seen = APP_VERSION
	try {
		localStorage.setItem(KEY, APP_VERSION)
	} catch {
		// Sans stockage, la mémoire de la page suffit à fermer le bandeau.
	}
}

/** Ce qui est sorti depuis la dernière visite ; vide tant que la lecture n'a pas eu lieu. */
export function pendingEntries() {
	return whatsNew.seen ? entriesSince(CHANGELOG, whatsNew.seen, APP_VERSION) : []
}
