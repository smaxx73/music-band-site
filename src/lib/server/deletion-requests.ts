import type { Sql, TransactionSql } from 'postgres'
import sql from './db'

// Demande de suppression d'une prise. Supprimer une prise est réservé à son déposant et
// aux admins du groupe (`canDeleteGroupContent`) ; les autres membres peuvent seulement
// le demander. La demande n'est qu'une notification (`deletion_request`), adressée à
// ceux qui peuvent supprimer : rien d'autre n'est gardé, et elle part avec la prise
// (`notifications.recording_id` en ON DELETE CASCADE). Le demandeur n'est pas prévenu
// d'un refus : garder la prise, c'est ne rien faire.
//
// Comme une mention ou une demande de présence, elle ne se désactive pas dans les
// préférences : elle attend une décision de qui la reçoit.

export const DELETION_REASON_MAX = 200

export type DeletionRequestTarget = {
	id: number
	take: number
	song_title: string
	uploaded_by_user_id: number | null
}

export type DeletionRequestRecipient = {
	id: number
	display_name: string
	is_uploader: boolean
}

export type ReceivedDeletionRequest = {
	actor_name: string
	reason: string | null
	created_at: string
}

/** La prise visée, dans le groupe actif ; `null` sinon (l'appelant répond `404`). */
export async function findDeletionTarget(
	recordingId: number,
	groupId: number
): Promise<DeletionRequestTarget | null> {
	const [row] = await sql<DeletionRequestTarget[]>`
		SELECT r.id, r.take, so.title AS song_title, r.uploaded_by_user_id
		FROM recordings r
		JOIN sessions ses ON ses.id = r.session_id
		JOIN songs so ON so.id = r.song_id
		WHERE r.id = ${recordingId} AND ses.group_id = ${groupId}
	`
	return row ?? null
}

/**
 * Le motif saisi : facultatif, vide = `null`. `undefined` signale un motif invalide
 * (pas une chaîne, ou trop long) — l'appelant répond `400`.
 */
export function parseDeletionReason(value: unknown): string | null | undefined {
	if (value === undefined || value === null) return null
	if (typeof value !== 'string') return undefined
	const reason = value.trim()
	if (reason.length > DELETION_REASON_MAX) return undefined
	return reason || null
}

/**
 * Ceux qui recevront la demande : les membres actifs du groupe qui peuvent supprimer la
 * prise — son déposant s'il est encore membre, les admins du groupe, et les admins
 * globaux qui en sont membres (la règle de `canDeleteGroupContent`). Jamais le demandeur.
 * Une notification appartient à un groupe : qui n'en est pas membre ne la verrait pas.
 */
function recipientsQuery<T extends Record<string, unknown>>(
	db: Sql<T> | TransactionSql<T>,
	target: DeletionRequestTarget,
	groupId: number,
	requesterId: number
) {
	// Fragment construit par la connexion qui l'exécute : dans la transaction, `tx`.
	return db`
		SELECT u.id, u.display_name, (u.id = ${target.uploaded_by_user_id}) IS TRUE AS is_uploader
		FROM user_groups ug
		JOIN users u ON u.id = ug.user_id
		WHERE ug.group_id = ${groupId}
		  AND u.active
		  AND u.id <> ${requesterId}
		  AND (u.id = ${target.uploaded_by_user_id} OR ug.role = 'admin' OR u.role IN ('admin', 'superadmin'))
	`
}

export async function deletionRequestRecipients(
	target: DeletionRequestTarget,
	groupId: number,
	requesterId: number
): Promise<DeletionRequestRecipient[]> {
	const rows = await sql<DeletionRequestRecipient[]>`
		SELECT * FROM (${recipientsQuery(sql, target, groupId, requesterId)}) AS r
		ORDER BY is_uploader DESC, display_name
	`
	return [...rows]
}

export type SendDeletionRequestResult =
	| { ok: true; recipients: number; requested_at: string }
	| { ok: false; status: number; error: string }

/**
 * Envoie la demande. Redemander remplace la précédente : le motif est celui du jour, et
 * la demande redevient non lue plutôt que de s'empiler dans la cloche.
 */
export async function sendDeletionRequest(
	target: DeletionRequestTarget,
	groupId: number,
	actor: { id: number; display_name: string },
	reason: string | null
): Promise<SendDeletionRequestResult> {
	const subject = `${target.song_title} — prise ${target.take}`

	const inserted = await sql.begin(async (tx) => {
		await tx`
			DELETE FROM notifications
			WHERE type = 'deletion_request' AND recording_id = ${target.id} AND actor_user_id = ${actor.id}
		`
		return tx<{ created_at: Date }[]>`
			INSERT INTO notifications (
				user_id, group_id, type, actor_user_id, actor_name, subject, excerpt, link, recording_id
			)
			SELECT
				r.id, ${groupId}, 'deletion_request', ${actor.id}, ${actor.display_name},
				${subject}, ${reason}, ${`/recording/${target.id}#supprimer`}, ${target.id}
			FROM (${recipientsQuery(tx, target, groupId, actor.id)}) AS r
			RETURNING created_at
		`
	})

	if (inserted.length === 0) {
		return {
			ok: false,
			status: 409,
			error: "Personne dans le groupe ne peut supprimer cette prise : ni son déposant ni un admin du groupe n'en est membre."
		}
	}
	return { ok: true, recipients: inserted.length, requested_at: inserted[0].created_at.toISOString() }
}

/** Dernière demande faite par ce membre sur cette prise, `null` s'il n'en a pas fait. */
export async function myDeletionRequestAt(recordingId: number, userId: number): Promise<string | null> {
	const [row] = await sql<{ at: Date | null }[]>`
		SELECT MAX(created_at) AS at FROM notifications
		WHERE type = 'deletion_request' AND recording_id = ${recordingId} AND actor_user_id = ${userId}
	`
	return row?.at ? row.at.toISOString() : null
}

/** Les demandes reçues sur cette prise, à montrer à côté de « Supprimer la prise ». */
export async function deletionRequestsReceived(
	recordingId: number,
	userId: number
): Promise<ReceivedDeletionRequest[]> {
	const rows = await sql<{ actor_name: string; reason: string | null; created_at: Date }[]>`
		SELECT COALESCE(u.display_name, n.actor_name) AS actor_name, n.excerpt AS reason, n.created_at
		FROM notifications n
		LEFT JOIN users u ON u.id = n.actor_user_id
		WHERE n.type = 'deletion_request' AND n.recording_id = ${recordingId} AND n.user_id = ${userId}
		ORDER BY n.created_at
	`
	return rows.map((r) => ({ ...r, created_at: r.created_at.toISOString() }))
}
