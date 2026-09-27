// Catalogue Deezer : retrouver une reprise par son titre pour compléter sa fiche
// (artiste d'origine, année, durée) et sa pochette. API publique, sans clé.
//
// Tout passe par notre serveur : seul le texte cherché part chez Deezer, jamais rien
// sur l'utilisateur. Rien n'est gardé de Deezer au-delà de ce que le membre choisit de
// reporter sur la fiche du morceau.

const DEEZER_API = 'https://api.deezer.com'
const TIMEOUT_MS = 6000
const SEARCH_LIMIT = 8
const COVER_MAX_BYTES = 8 * 1024 * 1024

export type CatalogTrack = {
	id: number
	title: string
	artist: string
	album: string | null
	duration_s: number | null
	/** Vignette pour la liste des résultats (250 px), servie par Deezer. */
	cover_url: string | null
	/** Seulement dans le détail d'un titre : la recherche ne la donne pas. */
	release_year: number | null
}

export type CatalogResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string }

const UNREACHABLE: CatalogResult<never> = {
	ok: false,
	status: 502,
	error: 'Le catalogue Deezer ne répond pas. Réessaie dans un instant.'
}

// ─── Lecture prudente de la réponse : rien n'est supposé de sa forme ───

type Json = Record<string, unknown>

function asObject(value: unknown): Json | null {
	return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : null
}

function asString(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null
}

function asNumber(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function parseTrack(raw: unknown): CatalogTrack | null {
	const track = asObject(raw)
	if (!track) return null
	const id = asNumber(track.id)
	// `title_short` : le titre sans sa mention de version (« Remastered 2011 », « Live »),
	// ce qu'on veut au référentiel.
	const title = asString(track.title_short) ?? asString(track.title)
	const artist = asString(asObject(track.artist)?.name)
	if (id === null || !title || !artist) return null

	const album = asObject(track.album)
	// La date du titre est souvent celle de sa réédition numérique (« Sunny » : 2007),
	// celle de l'album l'original (1966) — ou l'inverse sur une compilation. On garde la
	// plus ancienne. Deezer met « 0000-00-00 » quand il ne sait pas.
	const years = [asString(track.release_date), asString(album?.release_date)]
		.map((date) => (date ? Number(date.slice(0, 4)) : NaN))
		.filter((year) => year >= 1900 && year <= 2100)
	const year = years.length > 0 ? Math.min(...years) : null

	return {
		id,
		title,
		artist,
		album: asString(album?.title),
		duration_s: asNumber(track.duration),
		cover_url: asString(album?.cover_medium),
		release_year: year
	}
}

async function deezerGet(path: string): Promise<Json | null> {
	try {
		const res = await fetch(`${DEEZER_API}${path}`, { signal: AbortSignal.timeout(TIMEOUT_MS) })
		if (!res.ok) return null
		const body = asObject(await res.json())
		// Deezer répond 200 avec `{ error: … }` quand il refuse (quota, id inconnu).
		if (!body || body.error) return null
		return body
	} catch (err) {
		console.error('[deezer] appel impossible', path, err)
		return null
	}
}

export async function searchCatalog(query: string): Promise<CatalogResult<CatalogTrack[]>> {
	const q = query.trim()
	if (q.length < 2) return { ok: true, value: [] }
	if (q.length > 120) return { ok: false, status: 400, error: 'Recherche trop longue.' }

	const body = await deezerGet(`/search?q=${encodeURIComponent(q)}&limit=${SEARCH_LIMIT}`)
	if (!body) return UNREACHABLE
	const data = Array.isArray(body.data) ? body.data : []
	return { ok: true, value: data.map(parseTrack).filter((t): t is CatalogTrack => t !== null) }
}

async function trackDetail(id: number): Promise<{ track: CatalogTrack; coverXl: string | null } | null> {
	const body = await deezerGet(`/track/${id}`)
	const track = parseTrack(body)
	if (!body || !track) return null
	const album = asObject(body.album)
	return { track, coverXl: asString(album?.cover_xl) ?? asString(album?.cover_big) }
}

export async function catalogTrack(id: number): Promise<CatalogResult<CatalogTrack>> {
	const detail = await trackDetail(id)
	if (!detail) return { ok: false, status: 404, error: 'Titre introuvable dans le catalogue.' }
	return { ok: true, value: detail.track }
}

/**
 * Pochette d'album d'un titre, en octets. L'URL vient de la réponse de Deezer, jamais du
 * client — et même elle doit viser le CDN d'images de Deezer : le serveur ne télécharge
 * pas n'importe quoi. Taille bornée, lue au fil de l'eau.
 */
export async function fetchCatalogCover(id: number): Promise<CatalogResult<Buffer>> {
	const detail = await trackDetail(id)
	if (!detail) return { ok: false, status: 404, error: 'Titre introuvable dans le catalogue.' }
	if (!detail.coverXl) return { ok: false, status: 404, error: "Ce titre n'a pas de pochette." }

	let url: URL
	try {
		url = new URL(detail.coverXl)
	} catch {
		return { ok: false, status: 502, error: 'Pochette illisible.' }
	}
	if (url.protocol !== 'https:' || !url.hostname.endsWith('.dzcdn.net')) {
		return { ok: false, status: 502, error: 'Pochette hors du catalogue.' }
	}

	try {
		const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
		if (!res.ok || !res.body) return UNREACHABLE
		const chunks: Uint8Array[] = []
		let total = 0
		const reader = res.body.getReader()
		for (;;) {
			const { done, value } = await reader.read()
			if (done) break
			total += value.length
			if (total > COVER_MAX_BYTES) {
				await reader.cancel()
				return { ok: false, status: 413, error: 'Pochette trop lourde.' }
			}
			chunks.push(value)
		}
		return { ok: true, value: Buffer.concat(chunks) }
	} catch (err) {
		console.error('[deezer] pochette impossible à télécharger', id, err)
		return UNREACHABLE
	}
}
