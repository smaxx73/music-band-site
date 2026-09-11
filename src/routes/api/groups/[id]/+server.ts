import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import sql from '$lib/server/db'
import { deleteGroup, GROUP_LINK_FIELDS, renameGroup, updateGroupLinks } from '$lib/server/groups'
import { isAdmin, type GroupLinkField } from '$lib/types'

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!isAdmin(locals.user?.role)) return json({ error: 'Réservé aux administrateurs.' }, { status: 403 })

	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	const [group] = await sql`SELECT * FROM groups WHERE id = ${id}`
	if (!group) return json({ error: 'Groupe introuvable.' }, { status: 404 })

	return json(group)
}

// Nom et liens relèvent de l'administration du groupe lui-même : un admin de groupe
// peut les modifier sur le sien. La création reste transverse (admin global), la
// suppression est réservée au superadmin.
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })

	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	const body: unknown = await request.json().catch(() => null)
	if (typeof body !== 'object' || body === null) {
		return json({ error: 'Corps JSON attendu.' }, { status: 400 })
	}
	const input = body as Record<string, unknown>

	const links: Partial<Record<GroupLinkField, string | null>> = {}
	for (const field of GROUP_LINK_FIELDS) {
		if (!(field in input)) continue
		const value = input[field]
		if (value !== null && typeof value !== 'string') {
			return json({ error: `${field} doit être une chaîne ou null.` }, { status: 400 })
		}
		links[field] = value
	}

	if (!('name' in input) && Object.keys(links).length === 0) {
		return json({ error: 'Aucun champ à modifier.' }, { status: 400 })
	}
	if ('name' in input && typeof input.name !== 'string') {
		return json({ error: 'Le nom est obligatoire.' }, { status: 400 })
	}

	// Les liens d'abord : ils sont les seuls à pouvoir échouer sur une simple saisie,
	// autant ne pas avoir renommé le groupe pour rien.
	if (Object.keys(links).length > 0) {
		const result = await updateGroupLinks(locals.user, id, links)
		if (!result.ok) return json({ error: result.error }, { status: result.status })
	}

	if (typeof input.name === 'string') {
		const result = await renameGroup(locals.user, id, input.name)
		if (!result.ok) return json({ error: result.error }, { status: result.status })
	}

	const [group] = await sql`
		SELECT id, name, youtube_url, facebook_url, instagram_url FROM groups WHERE id = ${id}
	`
	if (!group) return json({ error: 'Groupe introuvable.' }, { status: 404 })
	return json(group)
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
