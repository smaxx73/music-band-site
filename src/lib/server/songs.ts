import sql from '$lib/server/db'

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
