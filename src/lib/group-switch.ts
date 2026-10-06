// Bascule du groupe actif depuis l'interface (sélecteur de groupe, page « Plus »).
// Le cookie `band_group` est écrit par l'API (`setActiveGroupCookie`) : ici, on ne fait
// que la demander puis recharger la page sous le nouveau groupe.

// Pages qui ne dépendent pas du groupe actif : on y reste telles quelles.
const UNSCOPED_SECTIONS = new Set(['perso', 'profile', 'admin', 'plus'])

// Listes d'une section : elles ont un sens dans n'importe quel groupe.
const SECTION_ROOTS = new Set([
	'fil', 'sessions', 'songs', 'playlists', 'setlists', 'agenda', 'group', 'upload', 'record'
])

// Une page de détail appartient à l'ancien groupe : on revient à la liste de sa section.
const DETAIL_PARENT: Record<string, string> = {
	sessions: '/sessions',
	recording: '/sessions',
	songs: '/songs',
	playlists: '/playlists',
	setlists: '/setlists',
	posts: '/fil',
	members: '/group',
	decoupe: '/upload'
}

/** Où atterrir après la bascule, depuis la page `pathname` : on garde la section. */
export function pathAfterSwitch(pathname: string): string {
	const segments = pathname.split('/').filter(Boolean)
	const [section] = segments
	if (!section) return '/'
	if (UNSCOPED_SECTIONS.has(section)) return pathname
	if (segments.length === 1 && SECTION_ROOTS.has(section)) return pathname
	return DETAIL_PARENT[section] ?? '/'
}

/** Bascule sur `groupId`, puis recharge `pathAfterSwitch(pathname)`. Lève une `Error`
 *  au message lisible si le serveur refuse. */
export async function switchActiveGroup(groupId: number, pathname: string): Promise<void> {
	const response = await fetch('/api/groups/switch', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ group_id: groupId })
	})
	if (!response.ok) {
		const body = await response.json().catch(() => ({}))
		throw new Error(body.error ?? 'Le changement de groupe a échoué.')
	}
	// Une navigation complète recharge le layout et la page sous le nouveau cookie.
	location.assign(pathAfterSwitch(pathname))
}
