import { error, redirect, type Cookies } from '@sveltejs/kit'
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
	groups: { id: number; name: string; role: GroupRole }[]
}

/**
 * De quoi décider, côté requête : où rejouer le lien, et si l'on a le droit d'écrire.
 *
 * `isDataRequest` distingue une vraie navigation d'une requête de données. SvelteKit
 * précharge les liens **au survol** (`data-sveltekit-preload-data` dans app.html) : sans
 * cette distinction, promener la souris sur un lien suffirait à changer le groupe actif
 * de tous les onglets, sans clic et sans que personne l'ait demandé. Une requête
 * spéculative n'a pas à modifier d'état.
 */
type LinkRequest = {
	cookies: Cookies
	url: URL
	isDataRequest: boolean
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
 * qui indique qu'il suffit de basculer.
 *
 * Deux issues selon la requête :
 *
 * - **navigation réelle** (on colle le lien reçu, on l'ouvre depuis un message) : on
 *   bascule et on rejoue l'URL avec le nouveau cookie. Le `load` a déjà tourné pour
 *   cette requête, `locals.user.current_group_id` n'y change plus ; et toute la page —
 *   sélecteur de groupe, compteur de notifications — doit parler du même groupe. Cela
 *   ne boucle pas : au second passage la ressource est dans le groupe actif.
 * - **requête de données** (navigation interne, et surtout préchargement au survol) :
 *   on n'écrit rien du tout et on explique, en laissant la bascule au clic de
 *   l'utilisateur. Cf. `LinkRequest.isDataRequest`.
 *
 * Ne fait rien — l'appelant enchaîne alors sur son 404 — quand la ressource n'existe
 * pas, quand le groupe actif est déjà le bon, ou quand l'utilisateur n'est pas membre
 * du groupe propriétaire. Ce dernier cas reste un 404 et jamais un 403 : répondre
 * « accès refusé », ou nommer le groupe, confirmerait l'existence de la prise à qui ne
 * doit rien en savoir.
 */
export async function retargetActiveGroup(
	user: LinkUser,
	request: LinkRequest,
	resource: ScopedResource,
	id: number
): Promise<void> {
	const groupId = await ownerGroupId(resource, id)
	if (groupId === null) return
	if (groupId === user.current_group_id) return

	const group = user.groups.find((g) => g.id === groupId)
	if (!group) return

	if (request.isDataRequest) {
		error(409, {
			message: `Ce contenu appartient à « ${group.name} », un autre de vos groupes.`,
			switch_group: { id: group.id, name: group.name }
		})
	}

	setActiveGroupCookie(request.cookies, group.id)
	// Cookie éclair : le layout le lit, l'efface et annonce la bascule une seule fois.
	request.cookies.set('band_group_switched', String(group.id), {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: 30
	})
	redirect(302, request.url.pathname + request.url.search)
}
