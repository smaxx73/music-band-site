import { ADDRESS_QUERY_MIN, type PlaceAddress } from '$lib/places'
import type { PlaceResult } from './places'

// Adresses de la Base Adresse Nationale, pour compléter le lieu d'une session.
//
// Service public de l'IGN (Géoplateforme), gratuit et sans clé. La saisie passe par notre
// serveur : seul le texte tapé part chez l'IGN, jamais rien sur l'utilisateur. France
// seulement, et des adresses, pas des noms de lieux — l'étiquette est là pour ça.

const BAN_SEARCH = 'https://data.geopf.fr/geocodage/search'
const TIMEOUT_MS = 5000
const SEARCH_LIMIT = 6
const QUERY_MAX = 200

const UNREACHABLE: PlaceResult<never> = {
	ok: false,
	status: 502,
	error: "Le service d'adresses ne répond pas. Saisis l'adresse à la main."
}

export async function searchAddresses(query: string): Promise<PlaceResult<PlaceAddress[]>> {
	const q = query.trim()
	if (q.length < ADDRESS_QUERY_MIN || q.length > QUERY_MAX) {
		return { ok: false, status: 400, error: `Entre ${ADDRESS_QUERY_MIN} et ${QUERY_MAX} caractères.` }
	}

	const url = new URL(BAN_SEARCH)
	url.searchParams.set('q', q)
	url.searchParams.set('autocomplete', '1')
	url.searchParams.set('limit', String(SEARCH_LIMIT))

	let body: unknown
	try {
		const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
		// La BAN refuse (400) une requête qu'elle ne sait pas lire, « ### » par exemple :
		// pour la saisie, c'est simplement « aucune adresse ».
		if (res.status === 400) return { ok: true, value: [] }
		if (!res.ok) return UNREACHABLE
		body = await res.json()
	} catch (err) {
		console.error('[addresses] Base Adresse Nationale injoignable', err)
		return UNREACHABLE
	}

	// Rien n'est supposé de la forme de la réponse.
	const features = (body as { features?: unknown })?.features
	if (!Array.isArray(features)) return { ok: true, value: [] }

	const addresses: PlaceAddress[] = []
	for (const feature of features) {
		const label = (feature as { properties?: { label?: unknown } })?.properties?.label
		const coords = (feature as { geometry?: { coordinates?: unknown } })?.geometry?.coordinates
		if (typeof label !== 'string' || !label.trim()) continue
		const [lon, lat] = Array.isArray(coords) ? coords : []
		const located = typeof lat === 'number' && typeof lon === 'number'
		addresses.push({ label: label.trim(), lat: located ? lat : null, lon: located ? lon : null })
	}
	return { ok: true, value: addresses }
}
