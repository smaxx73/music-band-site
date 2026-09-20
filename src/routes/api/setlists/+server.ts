import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import sql from '$lib/server/db'
import { listSetlists } from '$lib/server/setlists'
import { notifyGroup } from '$lib/server/notifications'

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	return json(await listSetlists(locals.user.current_group_id))
}

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const body = await request.json()
	const name: unknown = body.name
	const description: unknown = body.description

	if (typeof name !== 'string' || !name.trim()) {
		return json({ error: 'Le nom est obligatoire.' }, { status: 400 })
	}

	const [setlist] = await sql`
		INSERT INTO setlists (group_id, name, description, created_by, created_by_user_id)
		VALUES (
			${locals.user.current_group_id},
			${name.trim()},
			${typeof description === 'string' && description.trim() ? description.trim() : null},
			${locals.user.display_name},
			${locals.user.id}
		)
		RETURNING *
	`

	await notifyGroup({
		groupId: locals.user.current_group_id,
		actor: locals.user,
		type: 'setlist',
		subject: setlist.name,
		excerpt: setlist.description,
		link: `/setlists/${setlist.id}`,
		setlistId: setlist.id
	})

	return json(setlist, { status: 201 })
}
