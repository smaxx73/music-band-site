import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import { setActiveGroupCookie } from '$lib/server/group-scope'

// Permet à un onglet repris après une bascule ailleurs de vérifier le cookie partagé.
export const GET: RequestHandler = ({ locals }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	return json({ group_id: locals.user.current_group_id }, {
		headers: { 'cache-control': 'no-store' }
	})
}

export const POST: RequestHandler = async ({ locals, request, cookies }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })

	const body = await request.json()
	const group_id: unknown = body.group_id

	if (typeof group_id !== 'number' || isNaN(group_id)) {
		return json({ error: 'group_id invalide.' }, { status: 400 })
	}

	// Le groupe actif est résolu dans hooks.server.ts, qui n'honore que les groupes
	// dont l'utilisateur est membre — y compris pour un admin. Refuser ici aussi,
	// sinon la bascule renverrait un succès que le hook ignorerait silencieusement.
	const isMember = locals.user.groups.some((g) => g.id === group_id)
	if (!isMember) {
		return json({ error: "Vous n'appartenez pas à ce groupe." }, { status: 403 })
	}

	setActiveGroupCookie(cookies, group_id)

	return json({ success: true })
}
