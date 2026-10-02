// Le « retour » d'une page de passage (envoyer un fichier, enregistrer) : la page d'où
// l'on vient, nommée par ce qu'elle est. Un « ← Retour » muet ne disait pas où il menait,
// et chaque page en avait sa version.

export type BackLink = {
	href: string
	label: string
	/** Vrai quand on vient d'une page de l'application : revenir par l'historique
	 *  rend aussi sa position de défilement. */
	fromHistory: boolean
}

const PAGE_LABELS: [RegExp, string][] = [
	[/^\/$/, 'Tableau de bord'],
	[/^\/fil$/, "Fil d'actualité"],
	[/^\/sessions$/, 'Sessions'],
	[/^\/sessions\/\d+$/, 'Session'],
	[/^\/recording\/\d+$/, 'Prise'],
	[/^\/songs$/, 'Morceaux'],
	[/^\/songs\/\d+$/, 'Morceau'],
	[/^\/playlists$/, 'Playlists'],
	[/^\/playlists\/\d+$/, 'Playlist'],
	[/^\/setlists$/, 'Setlists'],
	[/^\/setlists\/\d+$/, 'Setlist'],
	[/^\/agenda$/, 'Agenda'],
	[/^\/perso(\/\d+)?$/, 'Mon espace perso'],
	[/^\/upload$/, 'Envoyer un fichier'],
	[/^\/record$/, 'Enregistrer'],
	[/^\/plus$/, 'Plus'],
]

/** Retour vers `from` (la page précédente, `afterNavigate`) si on sait la nommer,
 *  sinon vers `fallback`. */
export function backLinkFrom(from: URL | null | undefined, fallback: Omit<BackLink, 'fromHistory'>): BackLink {
	const label = from && PAGE_LABELS.find(([pattern]) => pattern.test(from.pathname))?.[1]
	if (!from || !label) return { ...fallback, fromHistory: false }
	return { href: from.pathname + from.search, label, fromHistory: true }
}
