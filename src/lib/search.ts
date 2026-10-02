/** Clé de recherche : sans casse ni accents, pour que « elise » trouve « Chez Élise ». */
export function searchKey(text: string): string {
	return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLocaleLowerCase('fr-FR')
}

/** Les mots d'une saisie, chacun en clé de recherche : « Sunny  mars » → ['sunny', 'mars']. */
export function searchTerms(query: string): string[] {
	return searchKey(query).split(/\s+/).filter(Boolean)
}
