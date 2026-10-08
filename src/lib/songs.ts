/**
 * Morceaux « à nommer » : créés d'un geste au moment de classer une prise, quand on n'a
 * pas le temps de chercher le titre. Le préfixe est le seul marqueur — pas de colonne en
 * base : renommer le morceau suffit à le faire sortir de cet état.
 */
export const PLACEHOLDER_SONG_PREFIX = 'À nommer — '

/** Libellés des statuts d'un morceau (`songs.status`), dans l'ordre des sélecteurs. */
export const SONG_STATUS_LABELS: Record<string, string> = {
	en_apprentissage: 'En apprentissage',
	proposition_de_travail: 'Proposition de travail',
	au_repertoire: 'Au répertoire',
	abandonne: 'Abandonné'
}

/**
 * Tempo de référence (`songs.tempo_bpm`) : ce qu'un métronome joue utilement. En deçà ou
 * au-delà, c'est une faute de frappe — la base porte la même borne.
 */
export const TEMPO_MIN_BPM = 20
export const TEMPO_MAX_BPM = 300

/**
 * Crédit d'un morceau, comme sur un album : l'interprète d'abord — le groupe, qui le
 * joue, reprise ou non —, puis l'origine : « reprise de Stevie Wonder », « écrit par
 * Julie ». Une reprise est un morceau qui a un artiste original ; sans lui, c'est une
 * composition du groupe, et `composer` en nomme les auteurs s'il y en a.
 */
export function songCredit(
	song: { composer: string | null; original_artist: string | null },
	groupName: string | null
): { artist: string; detail: string | null } {
	const detail = [
		song.original_artist ? `reprise de ${song.original_artist}` : null,
		song.composer ? `écrit par ${song.composer}` : null
	]
		.filter(Boolean)
		.join(' · ')
	return { artist: groupName ?? 'Composition du groupe', detail: detail || null }
}

/**
 * Surtitre d'un morceau ouvert comme un album (vue session) : l'interprète, et pour une
 * reprise son origine — « The Lambda », « The Lambda · reprise de Stevie Wonder ». Les
 * auteurs d'une composition restent sur la page du morceau : sur un album, l'artiste
 * passe avant eux.
 */
export function songAlbumArtist(song: { original_artist: string | null }, groupName: string | null): string {
	const artist = groupName ?? 'Composition du groupe'
	return song.original_artist ? `${artist} · reprise de ${song.original_artist}` : artist
}

export function isPlaceholderSongTitle(title: string): boolean {
	return title.startsWith(PLACEHOLDER_SONG_PREFIX)
}

/**
 * Teinte d'un morceau (0–360), pour sa pochette générée et l'en-tête de sa page. Tirée
 * de l'id seul, pas du titre : un morceau garde sa couleur d'une page à l'autre, et
 * renommer un morceau « À nommer » ne le repeint pas.
 */
export function songHue(songId: number): number {
	return (songId * 137) % 360
}

/**
 * « À nommer — 22 sept. 14:05 », suffixé « #2 », « #3 »… si le titre est déjà pris :
 * les titres sont uniques dans un groupe, et deux prises classées dans la même minute
 * ne doivent pas tomber sur le même morceau par accident.
 */
export function placeholderSongTitle(at: Date, taken: Iterable<string>, from = 1): string {
	const day = at.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
	const time = at.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
	const base = `${PLACEHOLDER_SONG_PREFIX}${day} ${time}`
	const used = new Set([...taken].map((t) => t.toLocaleLowerCase('fr')))
	for (let n = from; ; n++) {
		const candidate = n === 1 ? base : `${base} #${n}`
		if (!used.has(candidate.toLocaleLowerCase('fr'))) return candidate
	}
}

export type CreatedSong = { id: number; title: string; status: string }

export type CreateSongResult =
	| { ok: true; song: CreatedSong; existed: boolean }
	| { ok: false; error: string }

/**
 * Crée un morceau au statut par défaut. Un titre déjà présent dans le groupe n'est pas une
 * erreur : le morceau existant est rendu, sauf s'il est abandonné — il n'est alors pas
 * proposable, et le dire vaut mieux que de le ressusciter en douce.
 */
export async function createSong(title: string): Promise<CreateSongResult> {
	try {
		const res = await fetch('/api/songs', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ title })
		})
		const json = await res.json().catch(() => ({}))
		if (res.ok) return { ok: true, song: json as CreatedSong, existed: false }
		const existing = json.song as CreatedSong | null | undefined
		if (res.status === 409 && existing) {
			if (existing.status === 'abandonne') {
				return {
					ok: false,
					error: `« ${existing.title} » existe déjà mais est abandonné : réactive-le dans Morceaux.`
				}
			}
			return { ok: true, song: existing, existed: true }
		}
		return { ok: false, error: json.error ?? 'Erreur.' }
	} catch {
		return { ok: false, error: 'Erreur réseau.' }
	}
}

/** La liste d'un sélecteur, augmentée d'un morceau qu'on vient de créer, par titre. */
export function sortedWithSong<T extends { id: number; title: string }>(songs: T[], song: CreatedSong): T[] {
	if (songs.some((s) => s.id === song.id)) return songs
	return [...songs, song as unknown as T].sort((a, b) => a.title.localeCompare(b.title, 'fr'))
}
