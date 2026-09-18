import type { LayoutServerLoad } from './$types'
import { redirect } from '@sveltejs/kit'
import { unreadCount } from '$lib/server/notifications'
import { loginRedirect } from '$lib/redirect'

// "/" (hors connexion) et "/accueil" (toujours) servent la page d'accueil publique —
// voir +page.server.ts et routes/accueil — elles ne redirigent jamais vers /login.
const PUBLIC_PATHS = new Set(['/login', '/', '/accueil'])

export const load: LayoutServerLoad = async ({ locals, url, cookies }) => {
	if (!locals.user && !PUBLIC_PATHS.has(url.pathname)) {
		// La destination est emportée jusqu'à la connexion : un lien partagé s'ouvre
		// presque toujours sur une session expirée, et renvoyer au tableau de bord
		// perd justement ce qu'on venait de partager.
		redirect(302, loginRedirect(url))
	}

	// Un lien vers un autre de ses groupes a fait basculer le groupe actif
	// (`src/lib/server/group-scope.ts`) : le dire une fois, la bascule vaut aussi
	// pour les autres onglets, qui partagent le cookie.
	let group_switched_to: string | null = null
	const switched = cookies.get('band_group_switched')
	if (switched) {
		cookies.delete('band_group_switched', { path: '/' })
		group_switched_to =
			locals.user?.groups.find((g) => g.id === Number(switched))?.name ?? null
	}

	// Compté ici pour que la pastille soit juste dès le rendu serveur ; le menu la
	// rafraîchit ensuite tout seul sans recharger la page.
	const unread_notifications = locals.user
		? await unreadCount(locals.user.id, locals.user.current_group_id)
		: 0

	return { user: locals.user, unread_notifications, group_switched_to }
}
