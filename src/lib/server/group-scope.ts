import { redirect, type Cookies } from '@sveltejs/kit'
import sql from '$lib/server/db'
import type { GroupRole } from '$lib/types'

/** Un an : le groupe actif est une préférence, pas une session. */
const GROUP_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

/**
 * Pose le groupe actif. Les attributs du cookie doivent être identiques partout —
 * `hooks.server.ts` le relit à chaque requête, et un `maxAge` qui diverge d'un
 * point d'écriture à l'autre ferait expirer le groupe actif selon la page visitée.
 */
export function setActiveGroupCookie(cookies: Cookies, groupId: number): void {
	cookies.set('band_group', String(groupId), {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: GROUP_COOKIE_MAX_AGE
	})
}

/** Contenu groupe-scopé adressable par une URL partageable. */
export type ScopedResource = 'recording' | 'session' | 'song' | 'playlist'

type LinkUser = {
	current_group_id: number | null
	groups: { id: number; role: GroupRole }[]
}

/**
 * Groupe propriétaire de la ressource, sans filtre de groupe actif — c'est
 * précisément ce que l'écran vient de ne pas trouver.
 */
async function ownerGroupId(resource: ScopedResource, id: number): Promise<number | null> {
	const rows = await (resource === 'recording'
		? sql<{ group_id: number }[]>`
				SELECT ses.group_id
				FROM recordings r
				JOIN sessions ses ON ses.id = r.session_id
				WHERE r.id = ${id}
			`
		: resource === 'session'
			? sql<{ group_id: number }[]>`SELECT group_id FROM sessions  WHERE id = ${id}`
			: resource === 'song'
				? sql<{ group_id: number }[]>`SELECT group_id FROM songs     WHERE id = ${id}`
				: sql<{ group_id: number }[]>`SELECT group_id FROM playlists WHERE id = ${id}`)

	return rows[0] ? Number(rows[0].group_id) : null
}

/**
 * Rattrape un lien reçu qui vise un autre groupe de l'utilisateur.
 *
 * Tout le contenu est filtré par le groupe actif, gardé dans un cookie. Un membre de
 * deux groupes qui ouvre un lien vers le groupe où il n'est pas en train de travailler
 * recevait « introuvable » — le même message que pour un id qui n'existe pas, sans rien
 * qui indique qu'il suffit de basculer. Il bascule donc ici, et l'écran le dit
 * (`group_switched_to`, posé en cookie éclair et lu par le layout).
 *
 * Ne fait rien — l'appelant enchaîne alors sur son 404 — quand la ressource n'existe
 * pas, quand le groupe actif est déjà le bon, ou quand l'utilisateur n'est pas membre
 * du groupe propriétaire. Ce dernier cas reste un 404 et jamais un 403 : répondre
 * « accès refusé » confirmerait l'existence de la prise à qui ne doit rien en savoir.
 *
 * La redirection rejoue la même URL avec le nouveau cookie : le `load` a déjà tourné
 * pour cette requête, `locals.user.current_group_id` n'y change plus. Elle ne boucle
 * pas — au second passage le groupe actif est le bon, donc la ressource est trouvée.
 */
export async function retargetActiveGroup(
	user: LinkUser,
	cookies: Cookies,
	url: URL,
	resource: ScopedResource,
	id: number
): Promise<void> {
	const groupId = await ownerGroupId(resource, id)
	if (groupId === null) return
	if (groupId === user.current_group_id) return
	if (!user.groups.some((g) => g.id === groupId)) return

	setActiveGroupCookie(cookies, groupId)
	// Cookie éclair : le layout le lit, l'efface et annonce la bascule une seule fois.
	cookies.set('band_group_switched', String(groupId), {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: 30
	})
	redirect(302, url.pathname + url.search)
}
