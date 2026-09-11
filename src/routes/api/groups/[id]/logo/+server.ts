import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import {
	getGroupLogo,
	logoRequestTooLarge,
	removeGroupLogo,
	setGroupLogo
} from '$lib/server/groups'
import { groupLogoUrl } from '$lib/types'

export const GET: RequestHandler = async ({ locals, params, url }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })

	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	const result = await getGroupLogo(locals.user, id)
	if (!result.ok) return json({ error: result.error }, { status: result.status })

	const { mime_type, data } = result.value
	return new Response(new Uint8Array(data), {
		headers: {
			'Content-Type': mime_type,
			'Content-Length': String(data.length),
			'X-Content-Type-Options': 'nosniff',
			// Une URL versionnée (`?v=`) ne change jamais de contenu : cache long.
			// `private` car l'accès dépend de l'appartenance au groupe.
			'Cache-Control': url.searchParams.has('v')
				? 'private, max-age=31536000, immutable'
				: 'private, no-cache'
		}
	})
}

// Création ou remplacement : un groupe a au plus un logo. Champ multipart `logo`.
export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })

	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	if (logoRequestTooLarge(request)) {
		return json({ error: 'Le logo ne peut pas dépasser 2 Mo.' }, { status: 413 })
	}
	if (!(request.headers.get('content-type') ?? '').includes('multipart/form-data')) {
		return json({ error: 'Content-Type multipart/form-data attendu.' }, { status: 400 })
	}

	const data = await request.formData()
	const result = await setGroupLogo(locals.user, id, data.get('logo'))
	if (!result.ok) return json({ error: result.error }, { status: result.status })

	return json({ group_id: id, url: groupLogoUrl(id, result.value.version) }, { status: 201 })
}

export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })

	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	const result = await removeGroupLogo(locals.user, id)
	if (!result.ok) return json({ error: result.error }, { status: result.status })

	return json({ success: true })
}
