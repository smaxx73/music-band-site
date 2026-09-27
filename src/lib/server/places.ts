import sql from './db'
import { canManageGroup } from '$lib/types'
import { PLACE_LABEL_MAX, type GroupPlace, type PlaceAddress } from '$lib/places'

// Lieux du groupe : une étiquette (« Chez Élise ») et, si on la connaît, son adresse.
// Gérés depuis /group par les admins du groupe (`canManageGroup`), proposés à tout membre
// à la saisie du lieu d'une session ou d'un événement.
//
// Une session porte l'étiquette en texte (`location`) : c'est ce qui s'affiche partout.
// L'adresse, elle, se relit ici par l'étiquette — sans casse ni espaces de bord, comme
// l'index —, donc la corriger une fois la corrige pour toutes les sessions. Renommer un
// lieu réécrit le texte des sessions et événements qui le portaient.

export type PlaceResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string }

function fail(status: number, error: string): PlaceResult<never> {
	return { ok: false, status, error }
}

type ManagerRef = Parameters<typeof canManageGroup>[0]

type PlaceRow = {
	id: number
	label: string
	address: string | null
	latitude: number | null
	longitude: number | null
	uses: number
}

function toPlace(row: PlaceRow): GroupPlace {
	return {
		id: row.id,
		label: row.label,
		address: row.address ? { label: row.address, lat: row.latitude, lon: row.longitude } : null,
		uses: row.uses
	}
}

/** Les lieux du groupe, les plus employés d'abord (sessions et événements du groupe). */
export async function listGroupPlaces(groupId: number): Promise<GroupPlace[]> {
	const rows = await sql<PlaceRow[]>`
		SELECT
			gp.id, gp.label, gp.address, gp.latitude, gp.longitude,
			(
				(SELECT COUNT(*) FROM sessions s
				  WHERE s.group_id = gp.group_id AND lower(btrim(s.location)) = lower(btrim(gp.label)))
				-- L'événement d'une session reprend son lieu : ne compter que la session.
				+ (SELECT COUNT(*) FROM calendar_events e
				  WHERE e.group_id = gp.group_id AND e.session_id IS NULL
				    AND lower(btrim(e.location)) = lower(btrim(gp.label)))
			)::int AS uses
		FROM group_places gp
		WHERE gp.group_id = ${groupId}
		ORDER BY uses DESC, lower(gp.label)
	`
	return rows.map(toPlace)
}

/** Le lieu du groupe que désigne un texte de lieu, s'il y en a un. */
export async function findGroupPlace(groupId: number, location: string | null): Promise<GroupPlace | null> {
	if (!location?.trim()) return null
	const [row] = await sql<PlaceRow[]>`
		SELECT id, label, address, latitude, longitude, 0 AS uses FROM group_places
		WHERE group_id = ${groupId} AND lower(btrim(label)) = lower(btrim(${location}))
	`
	return row ? toPlace(row) : null
}

function checkLabel(label: string | null | undefined): PlaceResult<string> {
	const trimmed = label?.trim() ?? ''
	if (!trimmed) return fail(400, "L'étiquette du lieu est obligatoire.")
	if (trimmed.length > PLACE_LABEL_MAX) return fail(400, "L'étiquette est trop longue.")
	return { ok: true, value: trimmed }
}

// Violation de l'index unique `group_places_label` : l'étiquette existe déjà.
function isDuplicateLabel(err: unknown): boolean {
	return (err as { code?: string })?.code === '23505'
}

export async function createGroupPlace(
	actor: ManagerRef,
	groupId: number,
	label: string | null,
	address: PlaceAddress | null
): Promise<PlaceResult<{ id: number }>> {
	if (!canManageGroup(actor, groupId)) return fail(403, 'Réservé aux admins du groupe.')
	const checked = checkLabel(label)
	if (!checked.ok) return checked

	try {
		const [row] = await sql<{ id: number }[]>`
			INSERT INTO group_places (group_id, label, address, latitude, longitude)
			VALUES (${groupId}, ${checked.value}, ${address?.label ?? null}, ${address?.lat ?? null}, ${address?.lon ?? null})
			RETURNING id
		`
		return { ok: true, value: row }
	} catch (err) {
		if (isDuplicateLabel(err)) return fail(409, `Le lieu « ${checked.value} » existe déjà.`)
		throw err
	}
}

/**
 * Modifie un lieu. Renommé, il emporte le texte des sessions et événements du groupe
 * qui le portaient : sans cela, ils perdraient leur adresse, et le lieu ses sessions.
 */
export async function updateGroupPlace(
	actor: ManagerRef,
	groupId: number,
	placeId: number,
	label: string | null,
	address: PlaceAddress | null
): Promise<PlaceResult<null>> {
	if (!canManageGroup(actor, groupId)) return fail(403, 'Réservé aux admins du groupe.')
	const checked = checkLabel(label)
	if (!checked.ok) return checked

	try {
		return await sql.begin(async (tx) => {
			const [previous] = await tx<{ label: string }[]>`
				SELECT label FROM group_places WHERE id = ${placeId} AND group_id = ${groupId} FOR UPDATE
			`
			if (!previous) return fail(404, 'Lieu introuvable.')

			await tx`
				UPDATE group_places
				SET label = ${checked.value}, address = ${address?.label ?? null},
				    latitude = ${address?.lat ?? null}, longitude = ${address?.lon ?? null},
				    updated_at = now()
				WHERE id = ${placeId}
			`
			if (previous.label !== checked.value) {
				// Les coordonnées d'une adresse ponctuelle n'ont plus lieu d'être : le texte
				// désigne désormais un lieu du groupe, dont l'adresse se relit ici.
				await tx`
					UPDATE sessions SET location = ${checked.value}, location_lat = NULL, location_lon = NULL
					WHERE group_id = ${groupId} AND lower(btrim(location)) = lower(btrim(${previous.label}))
				`
				await tx`
					UPDATE calendar_events SET location = ${checked.value}, location_lat = NULL, location_lon = NULL
					WHERE group_id = ${groupId} AND lower(btrim(location)) = lower(btrim(${previous.label}))
				`
			}
			return { ok: true, value: null } as const
		})
	} catch (err) {
		if (isDuplicateLabel(err)) return fail(409, `Le lieu « ${checked.value} » existe déjà.`)
		throw err
	}
}

/**
 * Retire un lieu de la liste. Les sessions qui le portaient gardent leur texte de lieu,
 * sans l'adresse.
 */
export async function deleteGroupPlace(
	actor: ManagerRef,
	groupId: number,
	placeId: number
): Promise<PlaceResult<null>> {
	if (!canManageGroup(actor, groupId)) return fail(403, 'Réservé aux admins du groupe.')
	const [deleted] = await sql`
		DELETE FROM group_places WHERE id = ${placeId} AND group_id = ${groupId} RETURNING id
	`
	if (!deleted) return fail(404, 'Lieu introuvable.')
	return { ok: true, value: null }
}
