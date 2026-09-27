import { ADDRESS_QUERY_MIN, type PlaceAddress } from '$lib/places'

/**
 * Recherche d'adresses dans la Base Adresse Nationale, au fil de la frappe : une requête
 * par pause de frappe, pas par touche, et la dernière gagne — une réponse lente ne doit
 * pas écraser celle de ce qu'on a tapé depuis. Partagée par le lieu d'une session et
 * l'adresse d'un lieu du groupe.
 */
export class AddressSearch {
	results = $state<PlaceAddress[]>([])
	searching = $state(false)
	error = $state<string | null>(null)

	#timer: ReturnType<typeof setTimeout> | null = null
	#lastRequest = 0

	/** Ligne d'état à montrer quand il n'y a pas de résultat à proposer. */
	get status(): string | null {
		return this.searching ? 'Recherche d’adresses…' : this.error
	}

	/** Relance la recherche après une pause de frappe ; sous 3 caractères, vide la liste. */
	query(text: string) {
		if (this.#timer) clearTimeout(this.#timer)
		const q = text.trim()
		this.#timer = setTimeout(() => this.#run(q), 300)
	}

	/** Oublie la recherche en cours et ses résultats (une adresse vient d'être choisie). */
	clear() {
		if (this.#timer) clearTimeout(this.#timer)
		this.#lastRequest++
		this.results = []
		this.searching = false
		this.error = null
	}

	async #run(q: string) {
		const request = ++this.#lastRequest
		if (q.length < ADDRESS_QUERY_MIN) {
			this.results = []
			this.searching = false
			this.error = null
			return
		}
		this.searching = true
		this.error = null
		try {
			const res = await fetch(`/api/places/addresses?q=${encodeURIComponent(q)}`)
			const body = (await res.json().catch(() => ({}))) as { results?: PlaceAddress[]; error?: string }
			if (request !== this.#lastRequest) return
			this.results = res.ok ? (body.results ?? []) : []
			this.error = res.ok ? null : (body.error ?? `Erreur ${res.status}.`)
		} catch {
			if (request === this.#lastRequest) this.error = 'Service d’adresses injoignable.'
		} finally {
			if (request === this.#lastRequest) this.searching = false
		}
	}
}
