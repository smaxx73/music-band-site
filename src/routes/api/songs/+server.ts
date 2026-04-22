import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import sql from '$lib/server/db'

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const groupId = locals.user.current_group_id
	const all = url.searchParams.get('all') === 'true'

	const songs = all
		? await sql`
			SELECT * FROM songs
			WHERE group_id = ${groupId}
			ORDER BY title
		`
		: await sql`
			SELECT * FROM songs
			WHERE group_id = ${groupId} AND status != 'abandonne'
			ORDER BY title
		`

	return json(songs)
}

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const body = await request.json()
	const title: unknown = body.title
	const composer: unknown = body.composer
	const key: unknown = body.key
	const status: unknown = body.status

	if (typeof title !== 'string' || !title.trim()) {
		return json({ error: 'Le titre est obligatoire.' }, { status: 400 })
	}

	const validStatuses = ['en_apprentissage', 'au_repertoire', 'abandonne']
	if (status !== undefined && !validStatuses.includes(status as string)) {
		return json({ error: 'Statut invalide.' }, { status: 400 })
	}

	try {
		const [song] = await sql`
			INSERT INTO songs (group_id, title, composer, key, status)
			VALUES (
				${locals.user.current_group_id},
				${title.trim()},
				${typeof composer === 'string' && composer.trim() ? composer.trim() : null},
				${typeof key === 'string' && key.trim() ? key.trim() : null},
				${typeof status === 'string' && status ? status : 'en_apprentissage'}
			)
			RETURNING *
		`
		return json(song, { status: 201 })
	} catch (err) {
		if (isUniqueViolation(err)) {
			return json({ error: 'Ce titre existe déjà dans ce groupe.' }, { status: 409 })
		}
		throw err
	}
}

function isUniqueViolation(err: unknown): boolean {
	return (
		typeof err === 'object' &&
		err !== null &&
		'code' in err &&
		(err as { code: string }).code === '23505'
	)
}
