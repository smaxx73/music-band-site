import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import sql from '$lib/server/db'
import { getSetlist, setlistItems } from '$lib/server/setlists'
import { canDeleteGroupContent } from '$lib/types'

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	const setlist = await getSetlist(id, locals.user.current_group_id)
	if (!setlist) return json({ error: 'Setlist introuvable.' }, { status: 404 })

	return json({ setlist, items: await setlistItems(id) })
}

/** PATCH — nom et description. Modifiables par tout membre, comme le contenu du groupe. */
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	const payload: unknown = await request.json().catch(() => ({}))
	const body = payload && typeof payload === 'object' && !Array.isArray(payload)
		? payload as Record<string, unknown>
		: {}
	const hasName = Object.hasOwn(body, 'name')
	const hasDescription = Object.hasOwn(body, 'description')
	const name: unknown = body.name
	const description: unknown = body.description

	if (hasName && (typeof name !== 'string' || !name.trim())) {
		return json({ error: 'Le nom ne peut pas être vide.' }, { status: 400 })
	}
	if (hasDescription && description !== null && typeof description !== 'string') {
		return json({ error: 'description invalide.' }, { status: 400 })
	}
	if (!hasName && !hasDescription) {
		return json({ error: 'Aucune modification à enregistrer.' }, { status: 400 })
	}

	const setlist = await getSetlist(id, locals.user.current_group_id)
	if (!setlist) return json({ error: 'Setlist introuvable.' }, { status: 404 })

	const nextName = hasName ? (name as string).trim() : setlist.name
	const nextDescription = hasDescription
		? (typeof description === 'string' && description.trim() ? description.trim() : null)
		: setlist.description

	const [updated] = await sql`
		UPDATE setlists
		SET name = ${nextName}, description = ${nextDescription}, updated_at = now()
		WHERE id = ${id} AND group_id = ${locals.user.current_group_id}
		RETURNING *
	`

	return json(updated)
}

/** DELETE — son auteur, ou un admin du groupe, comme pour une session ou une prise. */
export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	const setlist = await getSetlist(id, locals.user.current_group_id)
	if (!setlist) return json({ error: 'Setlist introuvable.' }, { status: 404 })

	if (!canDeleteGroupContent(locals.user, locals.user.current_group_id, setlist.created_by_user_id)) {
		return json(
			{ error: 'Seul son auteur ou un administrateur du groupe peut supprimer cette setlist.' },
			{ status: 403 }
		)
	}

	// Les morceaux programmés et les commentaires tombent en cascade (migration 029).
	await sql`DELETE FROM setlists WHERE id = ${id} AND group_id = ${locals.user.current_group_id}`

	return json({ success: true })
}
