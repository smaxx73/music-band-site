import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'

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

	cookies.set('band_group', String(group_id), {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: 60 * 60 * 24 * 365
	})

	return json({ success: true })
}
