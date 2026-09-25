import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import {
	canSharePublicly,
	SHARE_DEFAULT_DAYS,
	SHARE_DURATIONS_DAYS,
	type ShareDurationDays,
	type ShareTarget
} from '$lib/types'
import { createShareLink, findShareTarget, listShareLinks } from '$lib/server/share-links'

// Une prise du groupe actif (tout membre) ou un enregistrement de son espace (le
// propriétaire seul). La cible hors de portée répond 404, jamais 403.

function parseTarget(recordingId: unknown, personalId: unknown): ShareTarget | null {
	const hasRecording = recordingId !== null && recordingId !== undefined && recordingId !== ''
	const hasPersonal = personalId !== null && personalId !== undefined && personalId !== ''
	if (hasRecording === hasPersonal) return null
	const id = Number(hasRecording ? recordingId : personalId)
	if (!Number.isInteger(id) || id <= 0) return null
	return { kind: hasRecording ? 'recording' : 'personal', id }
}

/** GET — `?recording_id=` ou `?personal_recording_id=` : les liens valides de la cible. */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })

	const target = parseTarget(url.searchParams.get('recording_id'), url.searchParams.get('personal_recording_id'))
	if (!target) return json({ error: 'Indiquer recording_id ou personal_recording_id.' }, { status: 400 })

	const found = await findShareTarget(target, locals.user)
	if (!found) return json({ error: 'Enregistrement introuvable.' }, { status: 404 })
	if (!canSharePublicly(locals.user, found.owner)) return json({ error: 'Accès refusé.' }, { status: 403 })

	return json(await listShareLinks(target))
}

/**
 * POST — `{ recording_id | personal_recording_id, expires_in_days? }`. Retourne le lien
 * créé avec son `token` en clair : c'est la seule fois qu'il est donné.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })

	const payload: unknown = await request.json().catch(() => null)
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
		return json({ error: 'Corps de requête invalide.' }, { status: 400 })
	}
	const body = payload as Record<string, unknown>

	const target = parseTarget(body.recording_id, body.personal_recording_id)
	if (!target) return json({ error: 'Indiquer recording_id ou personal_recording_id.' }, { status: 400 })

	const days = body.expires_in_days ?? SHARE_DEFAULT_DAYS
	if (!SHARE_DURATIONS_DAYS.includes(days as ShareDurationDays)) {
		return json({ error: `Durée invalide (${SHARE_DURATIONS_DAYS.join(', ')} jours).` }, { status: 400 })
	}

	const found = await findShareTarget(target, locals.user)
	if (!found) return json({ error: 'Enregistrement introuvable.' }, { status: 404 })
	if (!canSharePublicly(locals.user, found.owner)) return json({ error: 'Accès refusé.' }, { status: 403 })
	// Une vidéo seule se partage par son lien YouTube : il n'y a rien à servir d'ici.
	if (!found.hasAudio) {
		return json({ error: "Cet enregistrement n'a pas de piste audio : partagez directement la vidéo YouTube." }, { status: 400 })
	}

	const { token, link } = await createShareLink(target, locals.user.id, days as ShareDurationDays)
	return json({ ...link, token }, { status: 201 })
}
