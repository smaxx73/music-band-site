import sql from './db'
import { imageThumbnail } from './ffmpeg'
import { detectImageMime, imageRequestTooLarge } from './images'
import { fetchCatalogCover } from './deezer'

// Pochette d'un morceau : déposée par tout membre du groupe, comme le reste du
// référentiel. Groupe-scopée — contrairement au logo, rien n'est public ici : le morceau
// doit appartenir au groupe actif, sinon 404 (jamais 403, qui confirmerait son existence).

export type CoverResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string }

function fail(status: number, error: string): CoverResult<never> {
	return { ok: false, status, error }
}

// Une photo de téléphone dépasse vite les 2 Mo du logo ; elle est réduite à l'envoi.
export const COVER_MAX_BYTES = 8 * 1024 * 1024
const COVER_SIZE = 512
const COVER_THUMB_SIZE = 160

export function coverRequestTooLarge(request: Request): boolean {
	return imageRequestTooLarge(request, COVER_MAX_BYTES)
}

// Version de la pochette pour l'URL (`?v=`) : ses millisecondes de mise à jour, lues
// dans les requêtes qui listent des morceaux par
//   LEFT JOIN song_covers sc ON sc.song_id = s.id
//   floor(EXTRACT(EPOCH FROM sc.updated_at) * 1000)::float8 AS cover_version
// Une URL versionnée ne change jamais de contenu : elle se met en cache pour de bon.

async function songInGroup(songId: number, groupId: number): Promise<boolean> {
	const [song] = await sql`SELECT id FROM songs WHERE id = ${songId} AND group_id = ${groupId}`
	return !!song
}

export async function setSongCover(
	groupId: number,
	userId: number,
	songId: number,
	file: FormDataEntryValue | null
): Promise<CoverResult<{ version: number }>> {
	if (!(await songInGroup(songId, groupId))) return fail(404, 'Morceau introuvable.')

	if (!(file instanceof File) || file.size === 0) return fail(400, 'Aucune image reçue.')
	if (file.size > COVER_MAX_BYTES) return fail(413, "L'image ne peut pas dépasser 8 Mo.")

	return storeSongCover(songId, userId, Buffer.from(await file.arrayBuffer()))
}

/** La pochette d'album d'un titre du catalogue Deezer, choisi par le membre. */
export async function setSongCoverFromCatalog(
	groupId: number,
	userId: number,
	songId: number,
	trackId: number
): Promise<CoverResult<{ version: number }>> {
	if (!(await songInGroup(songId, groupId))) return fail(404, 'Morceau introuvable.')
	const cover = await fetchCatalogCover(trackId)
	if (!cover.ok) return cover
	return storeSongCover(songId, userId, cover.value)
}

// Même chemin pour un dépôt et un import : format vérifié, recadrage, deux JPEG.
async function storeSongCover(
	songId: number,
	userId: number,
	data: Buffer
): Promise<CoverResult<{ version: number }>> {
	if (!detectImageMime(data)) {
		return fail(415, 'Format non pris en charge : PNG, JPEG, WebP ou GIF uniquement.')
	}

	// Recadrée en carré et réencodée : l'original n'est pas gardé.
	let image: Buffer
	let thumbnail: Buffer
	try {
		;[image, thumbnail] = await Promise.all([
			imageThumbnail(data, COVER_SIZE, 'cover'),
			imageThumbnail(data, COVER_THUMB_SIZE, 'cover')
		])
	} catch (err) {
		console.error(`[song-covers] pochette du morceau ${songId} illisible`, err)
		return fail(415, "Cette image n'a pas pu être lue.")
	}

	const [cover] = await sql<{ version: number }[]>`
		INSERT INTO song_covers (song_id, image, thumbnail, updated_by_user_id)
		VALUES (${songId}, ${image}, ${thumbnail}, ${userId})
		ON CONFLICT (song_id) DO UPDATE
			SET image = EXCLUDED.image, thumbnail = EXCLUDED.thumbnail,
			    updated_at = now(), updated_by_user_id = EXCLUDED.updated_by_user_id
		RETURNING floor(EXTRACT(EPOCH FROM updated_at) * 1000)::float8 AS version
	`
	return { ok: true, value: cover }
}

export async function removeSongCover(groupId: number, songId: number): Promise<CoverResult<null>> {
	if (!(await songInGroup(songId, groupId))) return fail(404, 'Morceau introuvable.')
	const [deleted] = await sql`DELETE FROM song_covers WHERE song_id = ${songId} RETURNING song_id`
	if (!deleted) return fail(404, "Ce morceau n'a pas de pochette.")
	return { ok: true, value: null }
}

export async function getSongCover(
	groupId: number,
	songId: number,
	size: 'full' | 'thumb'
): Promise<CoverResult<Buffer>> {
	const [cover] = await sql<{ image: Buffer }[]>`
		SELECT ${size === 'thumb' ? sql`sc.thumbnail` : sql`sc.image`} AS image
		FROM song_covers sc
		JOIN songs s ON s.id = sc.song_id
		WHERE sc.song_id = ${songId} AND s.group_id = ${groupId}
	`
	if (!cover) return fail(404, 'Pochette introuvable.')
	return { ok: true, value: cover.image }
}
