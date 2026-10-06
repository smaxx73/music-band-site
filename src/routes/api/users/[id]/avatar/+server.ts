import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import { getUserAvatar } from '$lib/server/avatars'

/**
 * GET — la photo de profil d'un compte, au compte lui-même, aux membres de ses groupes et
 * aux admins globaux (`getUserAvatar`). `?size=thumb` sert la vignette. Avec `?v=`, l'URL
 * ne change jamais de contenu : cache long, mais privé. Le dépôt et le retrait ne sont pas
 * ici : ce sont des actions de /profile, sur son seul compte.
 */
export const GET: RequestHandler = async ({ locals, params, url }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })

	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	const cacheControl = url.searchParams.has('v')
		? 'private, max-age=31536000, immutable'
		: 'private, max-age=300'
	const size = url.searchParams.get('size') === 'thumb' ? 'thumb' : 'full'

	const result = await getUserAvatar(locals.user, id, size)
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
