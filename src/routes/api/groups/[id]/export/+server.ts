import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import { exportGroup } from '$lib/server/groups'

// Archive complète d'un groupe, servie en téléchargement. Sert de filet avant la
// suppression depuis la zone dangereuse de /admin/groups/[id]. Superadmin uniquement,
// comme la suppression elle-même : l'archive contient tout le contenu du groupe.
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })

	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	const result = await exportGroup(locals.user, id)
	if (!result.ok) return json({ error: result.error }, { status: result.status })

	const date = new Date().toISOString().slice(0, 10)
	const slug =
		result.value.name
			.toLowerCase()
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '') || 'groupe'

	return new Response(JSON.stringify(result.value.archive, null, 2), {
		headers: {
			'Content-Type': 'application/json',
			'Content-Disposition': `attachment; filename="groupe-${slug}-${date}.json"`
		}
	})
}
