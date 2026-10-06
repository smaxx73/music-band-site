import sql from './db'
import { imageThumbnail } from './ffmpeg'
import { detectImageMime, imageRequestTooLarge } from './images'
import { isAdmin, type RoleBearer } from '$lib/types'

// Photo de profil : déposée par le membre lui-même, sur son seul compte. Elle n'est pas
// groupe-scopée (un compte appartient à plusieurs groupes), mais pas publique non plus :
// la voient le membre, ceux qui partagent un de ses groupes, et les admins globaux, qui
// gèrent les comptes. Un compte hors de cette portée répond 404, comme une photo absente.

export type AvatarResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string }

function fail(status: number, error: string): AvatarResult<never> {
	return { ok: false, status, error }
}

// Une photo de téléphone, réduite à l'envoi : même plafond qu'une pochette.
export const AVATAR_MAX_BYTES = 8 * 1024 * 1024
const AVATAR_SIZE = 256
const AVATAR_THUMB_SIZE = 96

export function avatarRequestTooLarge(request: Request): boolean {
	return imageRequestTooLarge(request, AVATAR_MAX_BYTES)
}

// Version de la photo pour l'URL (`?v=`) : ses millisecondes de mise à jour, lues dans
// les requêtes qui listent des membres par
//   LEFT JOIN user_avatars ua ON ua.user_id = u.id
//   floor(EXTRACT(EPOCH FROM ua.updated_at) * 1000)::float8 AS avatar_version
// ou, quand les auteurs viennent de plusieurs sources (fil), par `avatarVersions`.
export const AVATAR_VERSION_SQL = sql`floor(EXTRACT(EPOCH FROM ua.updated_at) * 1000)::float8`

export async function setUserAvatar(
	userId: number,
	file: FormDataEntryValue | null
): Promise<AvatarResult<{ version: number }>> {
	if (!(file instanceof File) || file.size === 0) return fail(400, 'Aucune image reçue.')
	if (file.size > AVATAR_MAX_BYTES) return fail(413, "L'image ne peut pas dépasser 8 Mo.")

	const data = Buffer.from(await file.arrayBuffer())
	if (!detectImageMime(data)) {
		return fail(415, 'Format non pris en charge : PNG, JPEG, WebP ou GIF uniquement.')
	}

	// Recadrée en carré au centre et réencodée : ni l'original ni ses métadonnées (EXIF,
	// position GPS) ne sont gardés.
	let image: Buffer
	let thumbnail: Buffer
	try {
		;[image, thumbnail] = await Promise.all([
			imageThumbnail(data, AVATAR_SIZE, 'cover'),
			imageThumbnail(data, AVATAR_THUMB_SIZE, 'cover')
		])
	} catch (err) {
		console.error(`[avatars] photo du compte ${userId} illisible`, err)
		return fail(415, "Cette image n'a pas pu être lue.")
	}

	const [avatar] = await sql<{ version: number }[]>`
		INSERT INTO user_avatars (user_id, image, thumbnail)
		VALUES (${userId}, ${image}, ${thumbnail})
		ON CONFLICT (user_id) DO UPDATE
			SET image = EXCLUDED.image, thumbnail = EXCLUDED.thumbnail, updated_at = now()
		RETURNING floor(EXTRACT(EPOCH FROM updated_at) * 1000)::float8 AS version
	`
	return { ok: true, value: avatar }
}

export async function removeUserAvatar(userId: number): Promise<AvatarResult<null>> {
	const [deleted] = await sql`DELETE FROM user_avatars WHERE user_id = ${userId} RETURNING user_id`
	if (!deleted) return fail(404, "Vous n'avez pas de photo de profil.")
	return { ok: true, value: null }
}

export async function getUserAvatar(
	viewer: RoleBearer,
	userId: number,
	size: 'full' | 'thumb'
): Promise<AvatarResult<Buffer>> {
	// Le partage d'un groupe se vérifie dans la même requête que la lecture : une photo
	// hors de portée et une photo absente ne se distinguent pas.
	const visible =
		viewer.id === userId || isAdmin(viewer.role)
			? sql`true`
			: sql`EXISTS (
				SELECT 1 FROM user_groups mine
				JOIN user_groups theirs ON theirs.group_id = mine.group_id
				WHERE mine.user_id = ${viewer.id} AND theirs.user_id = ${userId}
			)`
	const [avatar] = await sql<{ image: Buffer }[]>`
		SELECT ${size === 'thumb' ? sql`thumbnail` : sql`image`} AS image
		FROM user_avatars
		WHERE user_id = ${userId} AND ${visible}
	`
	if (!avatar) return fail(404, 'Photo introuvable.')
	return { ok: true, value: avatar.image }
}

/** Versions des photos d'un lot de comptes ; un compte sans photo n'y figure pas. */
export async function avatarVersions(userIds: (number | null)[]): Promise<Map<number, number>> {
	const ids = [...new Set(userIds.filter((id): id is number => id !== null))]
	if (ids.length === 0) return new Map()
	const rows = await sql<{ user_id: number; version: number }[]>`
		SELECT ua.user_id, ${AVATAR_VERSION_SQL} AS version
		FROM user_avatars ua
		WHERE ua.user_id = ANY(${ids})
	`
	return new Map(rows.map((r) => [r.user_id, r.version]))
}
