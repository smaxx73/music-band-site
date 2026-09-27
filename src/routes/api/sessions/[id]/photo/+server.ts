import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import {
	getSessionPhoto,
	photoRequestTooLarge,
	removeSessionPhoto,
	setSessionPhoto,
	setSessionPhotoVeil
} from '$lib/server/session-photos'
import { parseSessionPhotoVeil } from '$lib/session-photo'

/**
 * GET — la photo de bandeau, aux membres du groupe actif. Avec `?v=`, l'URL ne change
 * jamais de contenu : cache long, mais privé — rien n'est public ici.
 */
export const GET: RequestHandler = async ({ locals, params, url }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	const cacheControl = url.searchParams.has('v')
		? 'private, max-age=31536000, immutable'
		: 'private, max-age=300'

	const result = await getSessionPhoto(locals.user.current_group_id, id)
	if (!result.ok) {
		return json({ error: result.error }, { status: result.status, headers: { 'Cache-Control': cacheControl } })
	}

	return new Response(new Uint8Array(result.value), {
		headers: {
			'Content-Type': 'image/jpeg',
			'Content-Length': String(result.value.length),
			'X-Content-Type-Options': 'nosniff',
			'Cache-Control': cacheControl
		}
	})
}

// Création ou remplacement (multipart, champ `photo`, `veil` facultatif), tout membre du
// groupe actif : comme le titre ou le lieu, le bandeau appartient à la session, pas à son
// créateur.
export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	if (photoRequestTooLarge(request)) {
		return json({ error: "L'image ne peut pas dépasser 8 Mo." }, { status: 413 })
	}
	if (!(request.headers.get('content-type') ?? '').includes('multipart/form-data')) {
		return json({ error: 'Content-Type multipart/form-data attendu.' }, { status: 400 })
	}

	const data = await request.formData()
	const rawVeil = data.get('veil')
	const veil = rawVeil === null ? null : parseSessionPhotoVeil(rawVeil)
	if (rawVeil !== null && veil === null) return json({ error: 'Intensité du voile invalide.' }, { status: 400 })

	const result = await setSessionPhoto(locals.user.current_group_id, locals.user.id, id, data.get('photo'), veil)
	if (!result.ok) return json({ error: result.error }, { status: result.status })

	return json({ session_id: id, photo_version: result.value.version, veil: result.value.veil }, { status: 201 })
}

// Intensité du voile (`{ veil }`), même droit que la photo.
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	const body = (await request.json().catch(() => null)) as { veil?: unknown } | null
	const veil = parseSessionPhotoVeil(body?.veil)
	if (veil === null) return json({ error: 'Intensité du voile invalide.' }, { status: 400 })

	const result = await setSessionPhotoVeil(locals.user.current_group_id, id, veil)
	if (!result.ok) return json({ error: result.error }, { status: result.status })

	return json({ session_id: id, photo_version: result.value.version, veil: result.value.veil })
}

export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	const result = await removeSessionPhoto(locals.user.current_group_id, id)
	if (!result.ok) return json({ error: result.error }, { status: result.status })

	return json({ success: true })
}
