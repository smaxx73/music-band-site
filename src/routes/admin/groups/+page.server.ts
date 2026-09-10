import type { PageServerLoad, Actions } from './$types'
import { error, fail } from '@sveltejs/kit'
import sql from '$lib/server/db'
import { isAdmin } from '$lib/types'

export const load: PageServerLoad = async () => {
	const groups = await sql`
		SELECT
			g.*,
			COUNT(DISTINCT ug.user_id)::int  AS member_count,
			COUNT(DISTINCT s.id)::int        AS song_count,
			COUNT(DISTINCT ses.id)::int      AS session_count
		FROM groups g
		LEFT JOIN user_groups ug  ON ug.group_id  = g.id
		LEFT JOIN songs s         ON s.group_id   = g.id
		LEFT JOIN sessions ses    ON ses.group_id  = g.id
		GROUP BY g.id
		ORDER BY g.name
	`
	return { groups }
}

export const actions: Actions = {
	create: async ({ request, locals }) => {
		if (!locals.user || !isAdmin(locals.user.role)) error(403, 'Accès réservé aux administrateurs')

		const data = await request.formData()
		const name = (data.get('name') as string | null)?.trim()

		if (!name) return fail(400, { action: 'create', error: 'Le nom est obligatoire.' })

		try {
			await sql`
				INSERT INTO groups (name, created_by)
				VALUES (${name}, ${locals.user.id})
			`
		} catch (err) {
			if (isUniqueViolation(err))
				return fail(409, { action: 'create', error: 'Ce nom de groupe existe déjà.' })
			throw err
		}
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
