// Lieu d'une session ou d'un événement : règles partagées par l'écran et le serveur.
//
// Le lieu reste un texte (`location`), affiché partout. À la saisie, il se choisit parmi
// les LIEUX DU GROUPE (une étiquette et son adresse, gérés depuis /group), ou comme une
// ADRESSE réelle ponctuelle, cherchée dans la Base Adresse Nationale — la session porte
// alors ses coordonnées pour le lien vers la carte. Voir src/lib/server/places.ts.

export type Coords = { lat: number; lon: number }

/** Une adresse : son libellé, et ses coordonnées quand elle vient de la Base Adresse Nationale. */
export type PlaceAddress = {
	label: string
	lat: number | null
	lon: number | null
}

/** Un lieu du groupe. */
export type GroupPlace = {
	id: number
	label: string
	address: PlaceAddress | null
	/** Sessions et événements qui le portent. */
	uses: number
}

export const PLACE_LABEL_MAX = 200
export const PLACE_ADDRESS_MAX = 300
/** La Base Adresse Nationale ne cherche rien sous 3 caractères. */
export const ADDRESS_QUERY_MIN = 3

/** Clé de comparaison d'une étiquette : sans casse ni espaces de bord, comme en base. */
export function placeKey(label: string): string {
	return label.trim().toLocaleLowerCase('fr-FR')
}

/** Clé de recherche : sans casse ni accents, pour que « elise » trouve « Chez Élise ». */
export function placeSearchKey(text: string): string {
	return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLocaleLowerCase('fr-FR')
}

/** Le lieu du groupe que désigne un texte de lieu, s'il y en a un. */
export function findPlace(places: GroupPlace[], location: string | null | undefined): GroupPlace | null {
	if (!location?.trim()) return null
	const key = placeKey(location)
	return places.find((p) => placeKey(p.label) === key) ?? null
}

/** Lien OpenStreetMap vers des coordonnées. */
export function mapUrl(coords: Coords | null): string | null {
	if (!coords) return null
	const lat = coords.lat.toFixed(6)
	const lon = coords.lon.toFixed(6)
	return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`
}

export function addressCoords(address: PlaceAddress | null | undefined): Coords | null {
	return address && address.lat !== null && address.lon !== null ? { lat: address.lat, lon: address.lon } : null
}

/**
 * Ce qu'on montre d'un lieu : l'adresse à afficher sous l'étiquette (lieu du groupe dont
 * l'adresse diffère de l'étiquette), et le lien vers la carte s'il y a des coordonnées —
 * celles du lieu du groupe, ou celles de l'adresse ponctuelle portée par la session.
 */
export function locationDetails(
	location: string | null,
	place: GroupPlace | null,
	coords: Coords | null
): { address: string | null; map: string | null } {
	if (!location) return { address: null, map: null }
	if (place) {
		const address = place.address && placeKey(place.address.label) !== placeKey(location) ? place.address.label : null
		return { address, map: mapUrl(addressCoords(place.address)) }
	}
	return { address: null, map: mapUrl(coords) }
}

function coordinate(value: unknown, limit: number): number | null {
	return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit ? value : null
}

/** Coordonnées reçues d'un client : `null` si absentes ou incomplètes, `undefined` si mal formées. */
export function parseCoords(value: unknown): Coords | null | undefined {
	if (value === null || value === undefined) return null
	if (typeof value !== 'object') return undefined
	const raw = value as Record<string, unknown>
	const lat = coordinate(raw.lat, 90)
	const lon = coordinate(raw.lon, 180)
	if (lat === null || lon === null) return undefined
	return { lat, lon }
}

/**
 * Adresse d'un lieu du groupe reçue du formulaire de /group : `null` si le champ est vide.
 * Les coordonnées ne sont gardées que par paire, et seulement avec une adresse.
 */
export function parsePlaceAddress(label: unknown, lat: unknown, lon: unknown): PlaceAddress | null {
	const text = typeof label === 'string' ? label.trim().slice(0, PLACE_ADDRESS_MAX) : ''
	if (!text) return null
	// Champs de formulaire : une chaîne vide n'est pas 0 — `Number('')` placerait le lieu
	// au large du golfe de Guinée.
	const num = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN)
	const coords = parseCoords({ lat: num(lat), lon: num(lon) }) ?? null
	return coords ? { label: text, ...coords } : { label: text, lat: null, lon: null }
}
