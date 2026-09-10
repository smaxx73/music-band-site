import { stat, unlink } from 'fs/promises'
import sql from './db'
import { audioPath } from './storage'
import {
	canAssignGroupAdmin,
	canDeleteGroup,
	canManageGroup,
	type GroupRole,
	type RoleBearer
} from '$lib/types'

// Les mêmes opérations sont exposées par les form actions (/group, /admin/groups/[id])
// et par les routes API. Elles vivent ici pour que les règles de droits ne soient
// écrites qu'une fois : chaque appelant se contente de rendre l'erreur à son format.
export type GroupOpResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string }

function fail(status: number, error: string): GroupOpResult<never> {
	return { ok: false, status, error }
}

function isUniqueViolation(err: unknown): boolean {
	return (
		typeof err === 'object' &&
		err !== null &&
		'code' in err &&
		(err as { code: string }).code === '23505'
	)
}

const FORBIDDEN = "Vous n'administrez pas ce groupe."
const ADMIN_ROLE_RESERVED = 'Seul un super-admin peut gérer les administrateurs de groupe.'

async function currentMemberRole(groupId: number, userId: number): Promise<GroupRole | null> {
	const [row] = await sql<{ role: GroupRole }[]>`
		SELECT role FROM user_groups WHERE group_id = ${groupId} AND user_id = ${userId}
	`
	return row?.role ?? null
}

export async function findActiveUserByNickname(
	nickname: string
): Promise<{ id: number; display_name: string } | null> {
	const [user] = await sql<{ id: number; display_name: string }[]>`
		SELECT id, display_name FROM users WHERE nickname = ${nickname} AND active = true
	`
	return user ?? null
}

export async function renameGroup(
	actor: RoleBearer,
	groupId: number,
	rawName: string | null | undefined
): Promise<GroupOpResult<{ id: number; name: string }>> {
	if (!canManageGroup(actor, groupId)) return fail(403, FORBIDDEN)

	const name = rawName?.trim()
	if (!name) return fail(400, 'Le nom est obligatoire.')
	if (name.length > 80) return fail(400, 'Le nom ne peut pas dépasser 80 caractères.')

	try {
		const [group] = await sql<{ id: number; name: string }[]>`
			UPDATE groups SET name = ${name} WHERE id = ${groupId} RETURNING id, name
		`
		if (!group) return fail(404, 'Groupe introuvable.')
		return { ok: true, value: group }
	} catch (err) {
		if (isUniqueViolation(err)) return fail(409, 'Ce nom de groupe existe déjà.')
		throw err
	}
}

export async function addGroupMember(
	actor: RoleBearer,
	groupId: number,
	userId: number,
	role: GroupRole = 'member'
): Promise<GroupOpResult<{ user_id: number; group_id: number; role: GroupRole }>> {
	if (!canManageGroup(actor, groupId)) return fail(403, FORBIDDEN)
	if (role === 'admin' && !canAssignGroupAdmin(actor)) return fail(403, ADMIN_ROLE_RESERVED)

	const [group] = await sql`SELECT id FROM groups WHERE id = ${groupId}`
	if (!group) return fail(404, 'Groupe introuvable.')

	const [user] = await sql<{ active: boolean }[]>`
		SELECT active FROM users WHERE id = ${userId}
	`
	if (!user) return fail(404, 'Utilisateur introuvable.')
	if (!user.active) return fail(409, 'Ce compte est désactivé.')

	// DO NOTHING plutôt que DO UPDATE : un ajout ne doit jamais changer le rôle d'un
	// membre existant, sinon un admin de groupe rétrograderait un admin en le « rajoutant ».
	const [member] = await sql<{ user_id: number; group_id: number; role: GroupRole }[]>`
		INSERT INTO user_groups (user_id, group_id, role)
		VALUES (${userId}, ${groupId}, ${role})
		ON CONFLICT (user_id, group_id) DO NOTHING
		RETURNING user_id, group_id, role
	`
	if (!member) return fail(409, 'Cet utilisateur est déjà membre du groupe.')

	return { ok: true, value: member }
}

export async function setGroupMemberRole(
	actor: RoleBearer,
	groupId: number,
	userId: number,
	role: GroupRole
): Promise<GroupOpResult<{ user_id: number; group_id: number; role: GroupRole }>> {
	if (!canManageGroup(actor, groupId)) return fail(403, FORBIDDEN)

	const existing = await currentMemberRole(groupId, userId)
	if (!existing) return fail(404, 'Membre introuvable.')

	// Attribuer comme retirer le rôle d'admin de groupe relève du superadmin :
	// sans cette symétrie, un admin global pourrait déposer un admin de groupe.
	if ((role === 'admin' || existing === 'admin') && !canAssignGroupAdmin(actor)) {
		return fail(403, ADMIN_ROLE_RESERVED)
	}

	const [member] = await sql<{ user_id: number; group_id: number; role: GroupRole }[]>`
		UPDATE user_groups SET role = ${role}
		WHERE user_id = ${userId} AND group_id = ${groupId}
		RETURNING user_id, group_id, role
	`
	if (!member) return fail(404, 'Membre introuvable.')

	return { ok: true, value: member }
}

export async function removeGroupMember(
	actor: RoleBearer,
	groupId: number,
	userId: number
): Promise<GroupOpResult<{ user_id: number }>> {
	if (!canManageGroup(actor, groupId)) return fail(403, FORBIDDEN)

	const existing = await currentMemberRole(groupId, userId)
	if (!existing) return fail(404, 'Membre introuvable.')

	// Retirer un admin du groupe revient à lui retirer son rôle : même réserve.
	// C'est aussi ce qui empêche un admin de groupe de se retirer lui-même.
	if (existing === 'admin' && !canAssignGroupAdmin(actor)) return fail(403, ADMIN_ROLE_RESERVED)

	// Un groupe sans membre n'est plus atteignable par personne : son contenu resterait
	// en base sans qu'aucun écran ne puisse l'afficher.
	const [{ count }] = await sql<{ count: number }[]>`
		SELECT COUNT(*)::int AS count FROM user_groups WHERE group_id = ${groupId}
	`
	if (count <= 1) {
		return fail(409, 'Impossible de retirer le dernier membre du groupe.')
	}

	const [deleted] = await sql<{ user_id: number }[]>`
		DELETE FROM user_groups
		WHERE user_id = ${userId} AND group_id = ${groupId}
		RETURNING user_id
	`
	if (!deleted) return fail(404, 'Membre introuvable.')

	return { ok: true, value: deleted }
}

// ─── Suppression d'un groupe ──────────────────────────────────────────────
// Opération irréversible et transverse : elle emporte tout le contenu du groupe
// et les fichiers audio correspondants. Réservée au superadmin.

export type GroupDeletionImpact = {
	members: number
	songs: number
	sessions: number
	recordings: number
	comments: number
	playlists: number
	calendar_events: number
	audio_bytes: number
}

// Chiffre ce que la suppression détruirait, pour l'afficher avant confirmation.
// Les comptes utilisateurs ne sont jamais touchés : seule l'appartenance disparaît.
export async function groupDeletionImpact(groupId: number): Promise<GroupDeletionImpact> {
	const [counts] = await sql<
		{
			members: number
			songs: number
			sessions: number
			recordings: number
			comments: number
			playlists: number
			calendar_events: number
		}[]
	>`
		SELECT
			(SELECT COUNT(*)::int FROM user_groups     WHERE group_id = ${groupId}) AS members,
			(SELECT COUNT(*)::int FROM songs           WHERE group_id = ${groupId}) AS songs,
			(SELECT COUNT(*)::int FROM sessions        WHERE group_id = ${groupId}) AS sessions,
			(SELECT COUNT(*)::int FROM calendar_events WHERE group_id = ${groupId}) AS calendar_events,
			(SELECT COUNT(*)::int FROM playlists       WHERE group_id = ${groupId}) AS playlists,
			(SELECT COUNT(*)::int
			   FROM recordings r
			   JOIN sessions s ON s.id = r.session_id
			  WHERE s.group_id = ${groupId}) AS recordings,
			(SELECT COUNT(*)::int
			   FROM comments c
			   JOIN recordings r ON r.id = c.recording_id
			   JOIN sessions s   ON s.id = r.session_id
			  WHERE s.group_id = ${groupId}) AS comments
	`

	const recordingIds = await groupRecordingIds(groupId)

	// Le volume audio est la part la plus concrète de l'impact. Un fichier manquant
	// (déjà supprimé, jamais converti) compte pour zéro plutôt que de faire échouer l'écran.
	const sizes = await Promise.all(
		recordingIds.map((id) =>
			stat(audioPath(id))
				.then((st) => st.size)
				.catch(() => 0)
		)
	)

	return { ...counts, audio_bytes: sizes.reduce((total, size) => total + size, 0) }
}

async function groupRecordingIds(groupId: number): Promise<number[]> {
	const rows = await sql<{ id: number }[]>`
		SELECT r.id
		FROM recordings r
		JOIN sessions s ON s.id = r.session_id
		WHERE s.group_id = ${groupId}
	`
	return rows.map((r) => r.id)
}

export async function deleteGroup(
	actor: RoleBearer,
	groupId: number,
	confirmation: string | null | undefined
): Promise<GroupOpResult<{ id: number; name: string; impact: GroupDeletionImpact }>> {
	if (!canDeleteGroup(actor)) {
		return fail(403, 'Seul un super-admin peut supprimer un groupe.')
	}

	const [group] = await sql<{ id: number; name: string }[]>`
		SELECT id, name FROM groups WHERE id = ${groupId}
	`
	if (!group) return fail(404, 'Groupe introuvable.')

	// Saisie du nom exigée jusque dans cette couche : une suppression aussi
	// destructrice ne doit pas dépendre d'un garde-fou seulement côté écran.
	if (confirmation?.trim() !== group.name) {
		return fail(400, `Saisissez exactement « ${group.name} » pour confirmer la suppression.`)
	}

	const impact = await groupDeletionImpact(groupId)
	const recordingIds = await groupRecordingIds(groupId)

	// songs, sessions et playlists référencent groups sans ON DELETE : l'ordre est
	// explicite plutôt que délégué à des cascades, pour que rien ne parte par accident
	// depuis un autre chemin de suppression.
	await sql.begin(async (tx) => {
		await tx`DELETE FROM playlists WHERE group_id = ${groupId}`
		await tx`DELETE FROM calendar_events WHERE group_id = ${groupId}`
		// Les prises tombent en cascade avec leurs sessions, entraînant commentaires,
		// réactions et entrées de playlist. Les morceaux ne partent qu'ensuite,
		// puisque recordings.song_id les retient.
		await tx`DELETE FROM sessions WHERE group_id = ${groupId}`
		await tx`DELETE FROM songs WHERE group_id = ${groupId}`
		await tx`DELETE FROM user_groups WHERE group_id = ${groupId}`
		await tx`DELETE FROM groups WHERE id = ${groupId}`
	})

	// Après commit seulement : un fichier orphelin est récupérable, une ligne
	// pointant vers un fichier disparu ne l'est pas.
	for (const id of recordingIds) {
		await unlink(audioPath(id)).catch(() => {})
	}

	return { ok: true, value: { id: group.id, name: group.name, impact } }
}

// ─── Archive d'un groupe ──────────────────────────────────────────────────
// Filet de sécurité avant suppression : tout ce que le groupe contient, sous une
// forme relisible. Ne contient JAMAIS de hash de mot de passe — les comptes ne
// sont pas supprimés avec le groupe, seule l'appartenance l'est.

export type GroupArchive = {
	exported_at: string
	exported_by: string
	group: Record<string, unknown>
	members: Record<string, unknown>[]
	songs: Record<string, unknown>[]
	sessions: Record<string, unknown>[]
	recordings: Record<string, unknown>[]
	comments: Record<string, unknown>[]
	playlists: Record<string, unknown>[]
	playlist_items: Record<string, unknown>[]
	calendar_events: Record<string, unknown>[]
	// Les mp3 eux-mêmes ne sont pas embarqués (plusieurs Go) : le manifeste permet
	// de les archiver à part depuis AUDIO_DIR avant de lancer la suppression.
	audio_files: { recording_id: number; file: string; bytes: number; sha256: string | null }[]
}

export async function exportGroup(
	actor: RoleBearer,
	groupId: number
): Promise<GroupOpResult<{ archive: GroupArchive; name: string }>> {
	if (!canDeleteGroup(actor)) {
		return fail(403, 'Seul un super-admin peut exporter un groupe.')
	}

	const [group] = await sql<{ id: number; name: string }[]>`
		SELECT * FROM groups WHERE id = ${groupId}
	`
	if (!group) return fail(404, 'Groupe introuvable.')

	const [members, songs, sessions, recordings, comments, playlists, playlistItems, calendarEvents] =
		await Promise.all([
			// Jamais password_hash : l'archive peut circuler hors de l'application.
			sql`
				SELECT u.id, u.nickname, u.display_name, u.role AS global_role,
				       ug.role AS group_role, ug.joined_at
				FROM user_groups ug JOIN users u ON u.id = ug.user_id
				WHERE ug.group_id = ${groupId} ORDER BY u.display_name
			`,
			sql`SELECT * FROM songs WHERE group_id = ${groupId} ORDER BY id`,
			sql`SELECT * FROM sessions WHERE group_id = ${groupId} ORDER BY id`,
			sql`
				SELECT r.* FROM recordings r
				JOIN sessions s ON s.id = r.session_id
				WHERE s.group_id = ${groupId} ORDER BY r.id
			`,
			sql`
				SELECT c.* FROM comments c
				JOIN recordings r ON r.id = c.recording_id
				JOIN sessions s   ON s.id = r.session_id
				WHERE s.group_id = ${groupId} ORDER BY c.id
			`,
			sql`SELECT * FROM playlists WHERE group_id = ${groupId} ORDER BY id`,
			sql`
				SELECT pi.* FROM playlist_items pi
				JOIN playlists p ON p.id = pi.playlist_id
				WHERE p.group_id = ${groupId} ORDER BY pi.playlist_id, pi.position
			`,
			sql`SELECT * FROM calendar_events WHERE group_id = ${groupId} ORDER BY id`
		])

	const audio_files = await Promise.all(
		(recordings as unknown as { id: number; file_hash: string | null }[]).map(async (r) => ({
			recording_id: r.id,
			file: `${r.id}.mp3`,
			bytes: await stat(audioPath(r.id))
				.then((st) => st.size)
				.catch(() => 0),
			sha256: r.file_hash
		}))
	)

	return {
		ok: true,
		value: {
			name: group.name,
			archive: {
				exported_at: new Date().toISOString(),
				exported_by: String(actor.id),
				group: group as unknown as Record<string, unknown>,
				members: members as unknown as Record<string, unknown>[],
				songs: songs as unknown as Record<string, unknown>[],
				sessions: sessions as unknown as Record<string, unknown>[],
				recordings: recordings as unknown as Record<string, unknown>[],
				comments: comments as unknown as Record<string, unknown>[],
				playlists: playlists as unknown as Record<string, unknown>[],
				playlist_items: playlistItems as unknown as Record<string, unknown>[],
				calendar_events: calendarEvents as unknown as Record<string, unknown>[],
				audio_files
			}
		}
	}
}
