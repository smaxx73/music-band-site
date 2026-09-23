/**
 * Morceaux « à nommer » : créés d'un geste au moment de classer une prise, quand on n'a
 * pas le temps de chercher le titre. Le préfixe est le seul marqueur — pas de colonne en
 * base : renommer le morceau suffit à le faire sortir de cet état.
 */
export const PLACEHOLDER_SONG_PREFIX = 'À nommer — '

export function isPlaceholderSongTitle(title: string): boolean {
	return title.startsWith(PLACEHOLDER_SONG_PREFIX)
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
