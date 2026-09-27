import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import {
	coverRequestTooLarge,
	getSongCover,
	removeSongCover,
	setSongCover,
	setSongCoverFromCatalog
} from '$lib/server/song-covers'

/**
 * GET — la pochette, aux membres du groupe actif. `?size=thumb` sert la vignette des
 * listes. Avec `?v=`, l'URL ne change jamais de contenu : cache long, mais privé — la
 * pochette n'est pas publique comme le logo. Sans `?v=` (mini-lecteur, qui ne connaît
 * pas la version), cache court.
 */
export const GET: RequestHandler = async ({ locals, params, url }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	const cacheControl = url.searchParams.has('v')
		? 'private, max-age=31536000, immutable'
		: 'private, max-age=300'
	const size = url.searchParams.get('size') === 'thumb' ? 'thumb' : 'full'

	const result = await getSongCover(locals.user.current_group_id, id, size)
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

// Création ou remplacement, tout membre du groupe actif : un fichier (multipart, champ
// `cover`), ou la pochette d'un titre du catalogue (JSON `{ deezer_track_id }`) — l'id
// seul, jamais une URL : le serveur ne va chercher l'image que chez Deezer.
export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	if ((request.headers.get('content-type') ?? '').includes('application/json')) {
		const body = (await request.json().catch(() => null)) as { deezer_track_id?: unknown } | null
		const trackId = body?.deezer_track_id
		if (typeof trackId !== 'number' || !Number.isInteger(trackId) || trackId <= 0) {
			return json({ error: 'deezer_track_id invalide.' }, { status: 400 })
		}
		const result = await setSongCoverFromCatalog(locals.user.current_group_id, locals.user.id, id, trackId)
		if (!result.ok) return json({ error: result.error }, { status: result.status })
		return json({ song_id: id, cover_version: result.value.version }, { status: 201 })
	}

	if (coverRequestTooLarge(request)) {
		return json({ error: "L'image ne peut pas dépasser 8 Mo." }, { status: 413 })
	}
	if (!(request.headers.get('content-type') ?? '').includes('multipart/form-data')) {
		return json({ error: 'Content-Type multipart/form-data ou application/json attendu.' }, { status: 400 })
	}

	const data = await request.formData()
	const result = await setSongCover(locals.user.current_group_id, locals.user.id, id, data.get('cover'))
	if (!result.ok) return json({ error: result.error }, { status: result.status })

	return json({ song_id: id, cover_version: result.value.version }, { status: 201 })
}

export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })
	if (!locals.user.current_group_id) return json({ error: 'Aucun groupe actif.' }, { status: 403 })

	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	const result = await removeSongCover(locals.user.current_group_id, id)
	if (!result.ok) return json({ error: result.error }, { status: result.status })

	return json({ success: true })
}
