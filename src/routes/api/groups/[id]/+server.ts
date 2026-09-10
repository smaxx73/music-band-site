import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import sql from '$lib/server/db'
import { deleteGroup, renameGroup } from '$lib/server/groups'
import { isAdmin } from '$lib/types'

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!isAdmin(locals.user?.role)) return json({ error: 'Réservé aux administrateurs.' }, { status: 403 })

	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	const [group] = await sql`SELECT * FROM groups WHERE id = ${id}`
	if (!group) return json({ error: 'Groupe introuvable.' }, { status: 404 })

	return json(group)
}

// Renommer relève de l'administration du groupe lui-même : un admin de groupe
// peut renommer le sien. La création reste transverse (admin global), la
// suppression est réservée au superadmin.
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })

	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	const body = await request.json()
	const name: unknown = body.name

	if (typeof name !== 'string') return json({ error: 'Le nom est obligatoire.' }, { status: 400 })

	const result = await renameGroup(locals.user, id, name)
	if (!result.ok) return json({ error: result.error }, { status: result.status })

	return json(result.value)
}

// Suppression en cascade, réservée au superadmin. Le nom du groupe doit être repassé
// en `?confirm=` : sans cela un appel malencontreux emporterait tout le contenu.
export const DELETE: RequestHandler = async ({ locals, params, url }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })

	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	const result = await deleteGroup(locals.user, id, url.searchParams.get('confirm'))
	if (!result.ok) return json({ error: result.error }, { status: result.status })

	return json({ success: true, deleted: result.value.impact })
}
