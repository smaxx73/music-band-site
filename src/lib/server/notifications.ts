import sql from './db'
import type { ActivityNotification, NotificationType } from '$lib/types'

// Les notifications sont écrites par fan-out : une ligne par destinataire au moment
// de l'action. C'est ce qui rend possible les actions du menu (lu / non lu / tout lu),
// qui supposent un état de lecture propre à chaque membre.
//
// Règle d'or : notifier ne doit jamais faire échouer l'action notifiée. Toutes les
// écritures passent par `notifyGroup`, qui avale ses erreurs après les avoir loguées.

const EXCERPT_MAX = 160
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

export type NotifyInput = {
	groupId: number
	actor: { id: number; display_name: string }
	type: NotificationType
	/** Morceau, nom de playlist, titre de session — mis en valeur à l'écran. */
	subject?: string | null
	/** Texte libre associé (contenu du commentaire, notes) — tronqué ici. */
	excerpt?: string | null
	link: string
	sessionId?: number | null
	recordingId?: number | null
	playlistId?: number | null
}

function truncate(value: string | null | undefined): string | null {
	const text = value?.trim()
	if (!text) return null
	return text.length > EXCERPT_MAX ? text.slice(0, EXCERPT_MAX - 1).trimEnd() + '…' : text
}

/**
 * Notifie tous les membres du groupe, sauf l'auteur de l'action.
 * Ne lève jamais : une notification perdue est moins grave qu'un upload refusé.
 */
export async function notifyGroup(input: NotifyInput): Promise<void> {
	try {
		await sql`
			INSERT INTO notifications (
				user_id, group_id, type, actor_user_id, actor_name,
				subject, excerpt, link, session_id, recording_id, playlist_id
			)
			SELECT
				ug.user_id,
				${input.groupId},
				${input.type},
				${input.actor.id},
				${input.actor.display_name},
				${truncate(input.subject)},
				${truncate(input.excerpt)},
				${input.link},
				${input.sessionId ?? null},
				${input.recordingId ?? null},
				${input.playlistId ?? null}
			FROM user_groups ug
			WHERE ug.group_id = ${input.groupId} AND ug.user_id <> ${input.actor.id}
		`
	} catch (err) {
		console.error('[notifications]', err)
	}
}

// Le nom de l'auteur est relu depuis `users` quand le compte existe encore, pour que
// un changement de nom affiché se répercute sur l'historique — comme pour les
// commentaires et les sessions. `actor_name` ne sert que de repli.
const SELECT_COLUMNS = sql`
	n.id, n.type, n.actor_user_id, n.subject, n.excerpt, n.link, n.read_at, n.created_at,
	COALESCE(u.display_name, n.actor_name) AS actor_name
`

export async function listNotifications(
	userId: number,
	groupId: number,
	options: { unreadOnly?: boolean; limit?: number } = {}
): Promise<ActivityNotification[]> {
	const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT)

	return (await sql<ActivityNotification[]>`
		SELECT ${SELECT_COLUMNS}
		FROM notifications n
		LEFT JOIN users u ON u.id = n.actor_user_id
		WHERE n.user_id = ${userId}
		  AND n.group_id = ${groupId}
		  ${options.unreadOnly ? sql`AND n.read_at IS NULL` : sql``}
		ORDER BY n.created_at DESC, n.id DESC
		LIMIT ${limit}
	`) as unknown as ActivityNotification[]
}

export async function unreadCount(userId: number, groupId: number | null): Promise<number> {
	if (!groupId) return 0
	const [row] = await sql<{ count: number }[]>`
		SELECT COUNT(*)::int AS count
		FROM notifications
		WHERE user_id = ${userId} AND group_id = ${groupId} AND read_at IS NULL
	`
	return row?.count ?? 0
}

/**
 * Marque une notification lue ou non lue. Le filtre sur `user_id` est la vérification
 * de droit : personne ne touche la notification d'un autre, admin compris.
 */
export async function markNotification(
	userId: number,
	notificationId: number,
	read: boolean
): Promise<ActivityNotification | null> {
	const [updated] = await sql<{ id: number }[]>`
		UPDATE notifications
		SET read_at = ${read ? sql`now()` : sql`NULL`}
		WHERE id = ${notificationId} AND user_id = ${userId}
		RETURNING id
	`
	if (!updated) return null

	const [full] = await sql<ActivityNotification[]>`
		SELECT ${SELECT_COLUMNS}
		FROM notifications n
		LEFT JOIN users u ON u.id = n.actor_user_id
		WHERE n.id = ${notificationId} AND n.user_id = ${userId}
	`
	return full ?? null
}

/** Tout marquer comme lu, dans le groupe actif uniquement. Retourne le nombre touché. */
export async function markAllRead(userId: number, groupId: number): Promise<number> {
	const updated = await sql`
		UPDATE notifications
		SET read_at = now()
		WHERE user_id = ${userId} AND group_id = ${groupId} AND read_at IS NULL
		RETURNING id
	`
	return updated.length
}
