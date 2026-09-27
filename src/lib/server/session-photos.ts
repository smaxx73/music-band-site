import sql from './db'
import { imageFrame } from './ffmpeg'
import { detectImageMime, imageRequestTooLarge } from './images'
import { SESSION_PHOTO_MAX_BYTES, SESSION_PHOTO_VEIL, type SessionPhoto } from '$lib/session-photo'

// Photo de bandeau d'une session : déposée par tout membre du groupe, comme les
// métadonnées de la session. Groupe-scopée — la session doit appartenir au groupe actif,
// sinon 404 (jamais 403, qui confirmerait son existence).

export type PhotoResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string }

function fail(status: number, error: string): PhotoResult<never> {
	return { ok: false, status, error }
}

// Une photo de téléphone pèse plusieurs Mo ; elle est réduite à l'envoi.
const PHOTO_MAX_BYTES = SESSION_PHOTO_MAX_BYTES

// Plus large que haut, mais moins que le bandeau à l'écran (≈ 6:1 sur ordinateur,
// ≈ 3,5:1 au téléphone) : l'écran recadre encore au centre (`background-size: cover`),
// et une bande trop étroite couperait les têtes au téléphone. 1600 px couvrent la
// colonne de 900 px sur un écran haute densité.
const PHOTO_WIDTH = 1600
const PHOTO_HEIGHT = 600

export function photoRequestTooLarge(request: Request): boolean {
	return imageRequestTooLarge(request, PHOTO_MAX_BYTES)
}

// Version de la photo pour l'URL (`?v=`) : ses millisecondes de mise à jour, comme
// pour une pochette de morceau. Une URL versionnée se met en cache pour de bon. Régler
// le voile ne la change pas : l'image, elle, n'a pas bougé.
export async function getSessionPhotoInfo(sessionId: number): Promise<SessionPhoto | null> {
	const [row] = await sql<SessionPhoto[]>`
		SELECT floor(EXTRACT(EPOCH FROM updated_at) * 1000)::float8 AS version, veil
		FROM session_photos WHERE session_id = ${sessionId}
	`
	return row ?? null
}

async function sessionInGroup(sessionId: number, groupId: number): Promise<boolean> {
	const [session] = await sql`SELECT id FROM sessions WHERE id = ${sessionId} AND group_id = ${groupId}`
	return !!session
}

export async function setSessionPhoto(
	groupId: number,
	userId: number,
	sessionId: number,
	file: FormDataEntryValue | null,
	/** Réglé en même temps que la photo ; `null` garde celui de la photo remplacée. */
	veil: number | null = null
): Promise<PhotoResult<SessionPhoto>> {
	if (!(await sessionInGroup(sessionId, groupId))) return fail(404, 'Session introuvable.')

	if (!(file instanceof File) || file.size === 0) return fail(400, 'Aucune image reçue.')
	if (file.size > PHOTO_MAX_BYTES) return fail(413, "L'image ne peut pas dépasser 8 Mo.")

	const data = Buffer.from(await file.arrayBuffer())
	if (!detectImageMime(data)) {
		return fail(415, 'Format non pris en charge : PNG, JPEG, WebP ou GIF uniquement.')
	}

	// Recadrée au format du bandeau et réencodée : l'original n'est pas gardé.
	let image: Buffer
	try {
		image = await imageFrame(data, PHOTO_WIDTH, PHOTO_HEIGHT, 'cover')
	} catch (err) {
		console.error(`[session-photos] photo de la session ${sessionId} illisible`, err)
		return fail(415, "Cette image n'a pas pu être lue.")
	}

	const [photo] = await sql<SessionPhoto[]>`
		INSERT INTO session_photos (session_id, image, veil, updated_by_user_id)
		VALUES (${sessionId}, ${image}, ${veil ?? SESSION_PHOTO_VEIL.default}, ${userId})
		ON CONFLICT (session_id) DO UPDATE
			SET image = EXCLUDED.image, updated_at = now(),
			    veil = COALESCE(${veil}::smallint, session_photos.veil),
			    updated_by_user_id = EXCLUDED.updated_by_user_id
		RETURNING floor(EXTRACT(EPOCH FROM updated_at) * 1000)::float8 AS version, veil
	`
	return { ok: true, value: photo }
}

/** Intensité du voile, déjà validée (`parseSessionPhotoVeil`). */
export async function setSessionPhotoVeil(
	groupId: number,
	sessionId: number,
	veil: number
): Promise<PhotoResult<SessionPhoto>> {
	if (!(await sessionInGroup(sessionId, groupId))) return fail(404, 'Session introuvable.')
	const [photo] = await sql<SessionPhoto[]>`
		UPDATE session_photos SET veil = ${veil}
		WHERE session_id = ${sessionId}
		RETURNING floor(EXTRACT(EPOCH FROM updated_at) * 1000)::float8 AS version, veil
	`
	if (!photo) return fail(404, "Cette session n'a pas de photo.")
	return { ok: true, value: photo }
}

export async function removeSessionPhoto(groupId: number, sessionId: number): Promise<PhotoResult<null>> {
	if (!(await sessionInGroup(sessionId, groupId))) return fail(404, 'Session introuvable.')
	const [deleted] = await sql`DELETE FROM session_photos WHERE session_id = ${sessionId} RETURNING session_id`
	if (!deleted) return fail(404, "Cette session n'a pas de photo.")
	return { ok: true, value: null }
}

export async function getSessionPhoto(groupId: number, sessionId: number): Promise<PhotoResult<Buffer>> {
	const [photo] = await sql<{ image: Buffer }[]>`
		SELECT sp.image
		FROM session_photos sp
		JOIN sessions s ON s.id = sp.session_id
		WHERE sp.session_id = ${sessionId} AND s.group_id = ${groupId}
	`
	if (!photo) return fail(404, 'Photo introuvable.')
	return { ok: true, value: photo.image }
}
