import type { PageServerLoad, Actions } from './$types'
import { error, fail } from '@sveltejs/kit'
import sql from '$lib/server/db'

export const load: PageServerLoad = async () => {
	const formats = await sql`
		SELECT id, label, mime_types, enabled
		FROM audio_formats
		ORDER BY id
	`
	return { formats }
}

export const actions: Actions = {
	toggleFormat: async ({ request, locals }) => {
		if (locals.user?.role !== 'admin') error(403, 'Accès réservé aux administrateurs')

		const data = await request.formData()
		const id = parseInt(data.get('id') as string)
		const enabled = data.get('enabled') === 'true'

		if (isNaN(id)) return fail(400, { error: 'ID invalide.' })

		const [format] = await sql`
			UPDATE audio_formats SET enabled = ${enabled}
			WHERE id = ${id}
			RETURNING id
		`
		if (!format) return fail(404, { error: 'Format introuvable.' })
	}
}
