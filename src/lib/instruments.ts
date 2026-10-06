// Instruments joués par un membre dans un groupe (`user_groups.instruments`).
// Partagé entre l'écran (suggestions, limites) et le serveur (normalisation).

/**
 * Proposés à la saisie, sans être imposés : un groupe joue du bandonéon ou de la
 * MAO aussi bien que de la guitare. La liste sert surtout à écrire pareil d'un membre à
 * l'autre (« Basse », pas « basse » ici et « Bassiste » là).
 */
export const INSTRUMENT_SUGGESTIONS = [
	'Chant',
	'Chœurs',
	'Guitare',
	'Guitare électrique',
	'Guitare acoustique',
	'Basse',
	'Contrebasse',
	'Batterie',
	'Percussions',
	'Piano',
	'Claviers',
	'Synthé',
	'Orgue',
	'Violon',
	'Alto',
	'Violoncelle',
	'Saxophone',
	'Trompette',
	'Trombone',
	'Clarinette',
	'Flûte',
	'Harmonica',
	'Accordéon',
	'Ukulélé',
	'Banjo',
	'Mandoline',
	'Son'
] as const

export const MAX_INSTRUMENTS = 8
export const MAX_INSTRUMENT_LENGTH = 40

/**
 * Nettoie une saisie : espaces repliés, majuscule initiale, doublons écartés sans
 * casse, l'orthographe de la liste reprise quand elle correspond (« batterie » →
 * « Batterie »). `null` si la liste dépasse les limites, plutôt que de la tronquer
 * en silence.
 */
export function normalizeInstruments(raw: readonly unknown[]): string[] | null {
	const seen = new Set<string>()
	const result: string[] = []
	for (const value of raw) {
		if (typeof value !== 'string') return null
		const name = value.replace(/\s+/g, ' ').trim()
		if (!name) continue
		if (name.length > MAX_INSTRUMENT_LENGTH) return null
		const key = name.toLocaleLowerCase('fr')
		if (seen.has(key)) continue
		seen.add(key)
		const known = INSTRUMENT_SUGGESTIONS.find((s) => s.toLocaleLowerCase('fr') === key)
		result.push(known ?? name.charAt(0).toLocaleUpperCase('fr') + name.slice(1))
	}
	return result.length > MAX_INSTRUMENTS ? null : result
}
