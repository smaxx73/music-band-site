import type { LayoutServerLoad } from './$types'
import { redirect } from '@sveltejs/kit'
import { unreadCount } from '$lib/server/notifications'

// "/" (hors connexion) et "/accueil" (toujours) servent la page d'accueil publique —
// voir +page.server.ts et routes/accueil — elles ne redirigent jamais vers /login.
const PUBLIC_PATHS = new Set(['/login', '/', '/accueil'])

export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (!locals.user && !PUBLIC_PATHS.has(url.pathname)) {
		redirect(302, '/login')
	}

	// Compté ici pour que la pastille soit juste dès le rendu serveur ; le menu la
	// rafraîchit ensuite tout seul sans recharger la page.
	const unread_notifications = locals.user
		? await unreadCount(locals.user.id, locals.user.current_group_id)
		: 0

	return { user: locals.user, unread_notifications }
}
