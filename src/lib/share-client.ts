// Partage côté navigateur : le lien pour le groupe d'une prise, et sa copie. Partagé par
// le menu « Partager » (ligne de prise, page de la prise) et le menu ⋮ des lignes.

/** Lien vers la prise, au repère `t` (secondes) s'il y en a un : partager depuis 1:23 partage 1:23. */
export function groupRecordingLink(recordingId: number, time: number | null): string {
	const target = new URL(`/recording/${recordingId}`, location.origin)
	if (time !== null) target.searchParams.set('t', String(time))
	return target.toString()
}

/**
 * Le presse-papiers demande un contexte sécurisé et peut être refusé : `false` dit à
 * l'appelant de montrer le lien à copier à la main.
 */
export async function copyText(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text)
		return true
	} catch {
		return false
	}
}

export function publicLinksLabel(count: number): string {
	return `${count} lien${count > 1 ? 's' : ''} d'écoute public${count > 1 ? 's' : ''} actif${count > 1 ? 's' : ''}`
}
