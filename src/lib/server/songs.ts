import sql from '$lib/server/db'
import { setSongCoverFromCatalog } from '$lib/server/song-covers'
import { TEMPO_MAX_BPM, TEMPO_MIN_BPM } from '$lib/songs'

export type SongDeleteResult = { ok: true } | { ok: false; status: number; error: string }

/**
 * Supprime un morceau du référentiel, s'il n'a aucune prise.
 *
 * Le morceau est d'abord cherché dans le groupe : un id d'un autre groupe répond `404`
 * avant tout comptage, sans quoi un `409` confirmerait son existence. Le verrou tient
 * le morceau du comptage à la suppression : une prise déposée entre les deux attend,
 * puis échoue sur sa clé étrangère, au lieu que ce soit la suppression qui plante.
 */
export async function deleteSong(groupId: number, songId: number): Promise<SongDeleteResult> {
	return sql.begin(async (tx) => {
		const [song] = await tx`
			SELECT id FROM songs WHERE id = ${songId} AND group_id = ${groupId} FOR UPDATE
		`
		if (!song) return { ok: false, status: 404, error: 'Morceau introuvable.' }

		const [{ count }] = await tx`
			SELECT COUNT(*)::int AS count FROM recordings WHERE song_id = ${songId}
		`
		if (count > 0) {
			return { ok: false, status: 409, error: 'Impossible de supprimer : des prises existent pour ce morceau.' }
		}

		await tx`DELETE FROM songs WHERE id = ${songId}`
		return { ok: true } as const
	})
}

const VALID_STATUSES = ['en_apprentissage', 'proposition_de_travail', 'au_repertoire', 'abandonne']

export type SongFormFields = {
	title: string
	composer: string | null
	key: string | null
	status: string
	original_artist: string | null
	release_year: number | null
	reference_duration_s: number | null
	tempo_bpm: number | null
	lyrics: string | null
	music_notes: string | null
}

const INVALID = Symbol('invalid')

/** Année à 4 chiffres, ou vide → null. */
function parseYear(raw: string | null): number | null | typeof INVALID {
	const trimmed = raw?.trim()
	if (!trimmed) return null
	if (!/^\d{4}$/.test(trimmed)) return INVALID
	return Number(trimmed)
}

/** "3:45" ou "225" (secondes) ; vide → null. */
function parseDuration(raw: string | null): number | null | typeof INVALID {
	const trimmed = raw?.trim()
	if (!trimmed) return null
	const match = trimmed.match(/^(\d+):([0-5]\d)$/)
	if (match) return Number(match[1]) * 60 + Number(match[2])
	if (/^\d+$/.test(trimmed)) return Number(trimmed)
	return INVALID
}

/** "120" (BPM, entier, borné) ; vide → null. */
function parseTempo(raw: string | null): number | null | typeof INVALID {
	const trimmed = raw?.trim()
	if (!trimmed) return null
	if (!/^\d+$/.test(trimmed)) return INVALID
	const bpm = Number(trimmed)
	return bpm >= TEMPO_MIN_BPM && bpm <= TEMPO_MAX_BPM ? bpm : INVALID
}

/**
 * Fiche d'un morceau telle que l'envoie le formulaire (`SongFields.svelte`), de /songs
 * comme de la page du morceau : les deux appliquent ainsi les mêmes règles.
 */
export function parseSongForm(data: FormData): { ok: true; fields: SongFormFields } | { ok: false; error: string } {
	const text = (name: string) => (data.get(name) as string | null)?.trim() || null
	const title = text('title')
	const status = (data.get('status') as string | null) ?? 'en_apprentissage'
	if (!title) return { ok: false, error: 'Le titre est obligatoire.' }
	if (!VALID_STATUSES.includes(status)) return { ok: false, error: 'Statut invalide.' }
	const release_year = parseYear(data.get('release_year') as string | null)
	if (release_year === INVALID) return { ok: false, error: 'Année de sortie invalide (AAAA).' }
	const reference_duration_s = parseDuration(data.get('reference_duration') as string | null)
	if (reference_duration_s === INVALID) return { ok: false, error: 'Durée de référence invalide (mm:ss).' }
	const tempo_bpm = parseTempo(data.get('tempo_bpm') as string | null)
	if (tempo_bpm === INVALID) return { ok: false, error: `Tempo invalide (BPM, de ${TEMPO_MIN_BPM} à ${TEMPO_MAX_BPM}).` }
	// Une reprise se reconnaît à son artiste original : sans lui, rien ne la distinguerait
	// d'une composition du groupe. Une composition n'en a jamais, même resté d'une saisie.
	const origin = data.get('origin')
	const original_artist = origin === 'composition' ? null : text('original_artist')
	if (origin === 'reprise' && !original_artist) return { ok: false, error: "Indique l'artiste original de la reprise." }
	return {
		ok: true,
		fields: {
			title,
			composer: text('composer'),
			key: text('key'),
			status,
			original_artist,
			release_year,
			reference_duration_s,
			tempo_bpm,
			lyrics: text('lyrics'),
			music_notes: text('music_notes')
		}
	}
}

export function isUniqueViolation(err: unknown): boolean {
	return typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === '23505'
}

/** Réécrit la fiche d'un morceau du groupe. Un id d'un autre groupe répond `404`. */
export async function updateSong(
	groupId: number,
	songId: number,
	f: SongFormFields
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
	try {
		const [song] = await sql`
			UPDATE songs
			SET title = ${f.title},
				composer = ${f.composer},
				key = ${f.key},
				release_year = ${f.release_year},
				original_artist = ${f.original_artist},
				reference_duration_s = ${f.reference_duration_s},
				tempo_bpm = ${f.tempo_bpm},
				lyrics = ${f.lyrics},
				music_notes = ${f.music_notes},
				status = ${f.status}
			WHERE id = ${songId} AND group_id = ${groupId}
			RETURNING id
		`
		if (!song) return { ok: false, status: 404, error: 'Morceau introuvable.' }
		return { ok: true }
	} catch (err) {
		if (isUniqueViolation(err)) return { ok: false, status: 409, error: 'Ce titre existe déjà dans ce groupe.' }
		throw err
	}
}

/**
 * Pochette d'un titre choisi dans le catalogue Deezer (`deezer_track_id`), importée une
 * fois la fiche enregistrée. Son échec ne défait pas l'enregistrement : la fiche est
 * bonne, la pochette se redépose depuis la page du morceau. Rend le message à afficher.
 */
export async function importCatalogCover(
	groupId: number,
	userId: number,
	songId: number,
	data: FormData
): Promise<string | null> {
	const trackId = Number(data.get('deezer_track_id'))
	if (!Number.isInteger(trackId) || trackId <= 0) return null
	const result = await setSongCoverFromCatalog(groupId, userId, songId, trackId)
	return result.ok ? null : result.error
}
