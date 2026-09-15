// Une mention est du texte ordinaire : `@pseudo`. Même règle à l'affichage (mise en
// évidence) et au serveur (notification), pour qu'une mention surlignée soit toujours
// une mention notifiée.

// Un pseudo peut contenir davantage que des lettres ou chiffres ; une mention s'étend
// donc jusqu'au prochain espace, comme la saisie @ elle-même. Le @ doit commencer un
// mot : une adresse e-mail n'est pas une mention.
export const MENTION_PATTERN = /(^|[\s([{])(@[^\s@]+)/g

// Ponctuation collée à la mention par l'écriture (« merci @marc, … »), pas au pseudo.
const TRAILING_PUNCTUATION = /[.,;:!?)\]}'"»…]+$/

/**
 * Pseudos candidats mentionnés dans un texte, en minuscules. Chaque mention donne sa
 * forme brute et sa forme sans ponctuation finale : un pseudo qui se termine lui-même
 * par un point reste reconnu. C'est la base qui tranche entre les deux.
 */
export function mentionCandidates(content: string): string[] {
	const candidates = new Set<string>()
	for (const match of content.matchAll(MENTION_PATTERN)) {
		const raw = match[2].slice(1).toLocaleLowerCase('fr-FR')
		candidates.add(raw)
		const trimmed = raw.replace(TRAILING_PUNCTUATION, '')
		if (trimmed) candidates.add(trimmed)
	}
	return [...candidates]
}
