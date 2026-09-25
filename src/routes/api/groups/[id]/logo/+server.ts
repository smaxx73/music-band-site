import type { RequestHandler } from './$types'
import { json, redirect } from '@sveltejs/kit'
import {
	getGroupLogo,
	getGroupLogoThumbnail,
	logoRequestTooLarge,
	removeGroupLogo,
	setGroupLogo
} from '$lib/server/groups'
import { DEFAULT_SHARE_IMAGE, groupLogoUrl } from '$lib/types'

/**
 * GET — public, sans compte : le logo est la vitrine du groupe, et l'image d'aperçu d'un
 * lien d'écoute collé dans une messagerie, dont le robot n'est pas connecté.
 * `?size=thumb` sert la miniature JPEG (quelques dizaines de Ko) ; si le logo ne se laisse
 * pas réduire, redirection vers l'image par défaut plutôt qu'un aperçu vide.
 */
export const GET: RequestHandler = async ({ params, url }) => {
	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	// Une URL versionnée (`?v=`) ne change jamais de contenu : cache long, partageable.
	const cacheControl = url.searchParams.has('v')
		? 'public, max-age=31536000, immutable'
		: 'public, no-cache'

	if (url.searchParams.get('size') === 'thumb') {
		const result = await getGroupLogoThumbnail(id)
		if (!result.ok) return json({ error: result.error }, { status: result.status })
		if (!result.value) redirect(302, DEFAULT_SHARE_IMAGE)
		return imageResponse('image/jpeg', result.value.data, cacheControl)
	}

	const result = await getGroupLogo(id)
	if (!result.ok) return json({ error: result.error }, { status: result.status })
	return imageResponse(result.value.mime_type, result.value.data, cacheControl)
}

function imageResponse(mimeType: string, data: Buffer, cacheControl: string): Response {
	return new Response(new Uint8Array(data), {
		headers: {
			'Content-Type': mimeType,
			'Content-Length': String(data.length),
			'X-Content-Type-Options': 'nosniff',
			'Cache-Control': cacheControl
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
