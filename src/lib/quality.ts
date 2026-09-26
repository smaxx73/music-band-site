// Qualité d'une prise (`recordings.status`) : texte libre, dont quatre valeurs courantes
// ont leur couleur de badge. Les anciennes valeurs (avant la qualité libre) y sont
// rattachées ; tout le reste prend le badge neutre `custom`.
const QUALITY_CLASS: Record<string, string> = {
	'à revoir': 'a-revoir',
	'moyen': 'moyen',
	'bon': 'bon',
	'référence': 'reference',
	'en_cours': 'a-revoir',
	'au_point': 'bon',
	'repertoire': 'reference'
}

/** Suffixe de la classe `badge-quality-…` (src/app.css) pour une qualité. */
export function qualityClass(status: string): string {
	return QUALITY_CLASS[status.trim().toLocaleLowerCase('fr-FR')] ?? 'custom'
}
