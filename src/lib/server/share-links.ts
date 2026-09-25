import { createHash, randomBytes } from 'crypto'
import sql from './db'
import type { ShareDurationDays, ShareLinkView, ShareTarget } from '$lib/types'

// Liens d'écoute publics : la seule porte de l'application qui s'ouvre sans compte.
// Tout ce qui la franchit passe par ce module — la page `/ecoute/[token]` comme son
// fichier audio — pour qu'il n'y ait qu'un endroit où décider de ce qui est exposé :
// un fichier audio, un titre, une date. Ni commentaires, ni note, ni participants.

// 24 octets = 192 bits : impossible à deviner, même à des millions d'essais par seconde.
const TOKEN_BYTES = 24
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/

/**
 * Seule l'empreinte du jeton est en base : il vaut un mot de passe, et une sauvegarde
 * `pg_dump` téléchargée ne doit pas publier d'enregistrements. Un SHA-256 suffit, sans
 * sel ni scrypt : le jeton est aléatoire, il n'y a pas de dictionnaire à décourager.
 */
function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex')
}

function targetFilter(target: ShareTarget) {
	return target.kind === 'recording'
		? sql`sl.recording_id = ${target.id}`
		: sql`sl.personal_recording_id = ${target.id}`
}

/** À qui revient le droit de partager la cible — voir `canSharePublicly`. */
export type ShareOwner = { groupId: number } | { userId: number }

/**
 * La cible telle que l'utilisateur la voit : une prise du groupe actif, ou un
 * enregistrement de son propre espace. Ailleurs, `null` — l'appelant répond 404, comme
 * partout, pour ne rien confirmer de ce qu'il n'a pas à connaître.
 */
export async function findShareTarget(
	target: ShareTarget,
	user: { id: number; current_group_id: number | null }
): Promise<{ owner: ShareOwner; hasAudio: boolean } | null> {
	if (target.kind === 'recording') {
		if (!user.current_group_id) return null
		const [row] = await sql<{ group_id: number; file_path: string | null }[]>`
			SELECT ses.group_id, r.file_path
			FROM recordings r
			JOIN sessions ses ON ses.id = r.session_id
			WHERE r.id = ${target.id} AND ses.group_id = ${user.current_group_id}
		`
		return row ? { owner: { groupId: row.group_id }, hasAudio: row.file_path !== null } : null
	}
	const [row] = await sql<{ user_id: number; file_path: string | null }[]>`
		SELECT user_id, file_path FROM personal_recordings
		WHERE id = ${target.id} AND user_id = ${user.id}
	`
	return row ? { owner: { userId: row.user_id }, hasAudio: row.file_path !== null } : null
}

const VIEW_COLUMNS = sql`
	sl.id, sl.created_at, sl.expires_at, sl.last_accessed_at,
	u.display_name AS created_by
`

/** Liens encore valides. Un lien expiré ne s'affiche plus : il n'ouvre plus rien. */
export async function listShareLinks(target: ShareTarget): Promise<ShareLinkView[]> {
	return (await sql<ShareLinkView[]>`
		SELECT ${VIEW_COLUMNS}
		FROM share_links sl
		LEFT JOIN users u ON u.id = sl.created_by_user_id
		WHERE ${targetFilter(target)} AND sl.expires_at > now()
		ORDER BY sl.created_at DESC
	`) as unknown as ShareLinkView[]
}

/** Nombre de liens valides : ce que la page de l'enregistrement signale à tous. */
export async function activeShareCount(target: ShareTarget): Promise<number> {
	const [{ count }] = await sql<{ count: number }[]>`
		SELECT COUNT(*)::int AS count FROM share_links sl
		WHERE ${targetFilter(target)} AND sl.expires_at > now()
	`
	return count
}

/** Le jeton en clair n'existe qu'ici et dans la réponse à son créateur. */
export async function createShareLink(
	target: ShareTarget,
	userId: number,
	days: ShareDurationDays
): Promise<{ token: string; link: ShareLinkView }> {
	const token = randomBytes(TOKEN_BYTES).toString('base64url')
	const [created] = await sql<{ id: number }[]>`
		INSERT INTO share_links (token_hash, recording_id, personal_recording_id, created_by_user_id, expires_at)
		VALUES (
			${hashToken(token)},
			${target.kind === 'recording' ? target.id : null},
			${target.kind === 'personal' ? target.id : null},
			${userId},
			now() + make_interval(days => ${days})
		)
		RETURNING id
	`
	const [link] = await sql<ShareLinkView[]>`
		SELECT ${VIEW_COLUMNS}
		FROM share_links sl
		LEFT JOIN users u ON u.id = sl.created_by_user_id
		WHERE sl.id = ${created.id}
	`
	return { token, link }
}

/** Ce qu'ouvre un lien, pour en vérifier le droit avant de le révoquer. */
export async function findShareLink(id: number): Promise<{ id: number; target: ShareTarget } | null> {
	const [row] = await sql<{ id: number; recording_id: number | null; personal_recording_id: number | null }[]>`
		SELECT id, recording_id, personal_recording_id FROM share_links WHERE id = ${id}
	`
	if (!row) return null
	const target: ShareTarget = row.recording_id !== null
		? { kind: 'recording', id: row.recording_id }
		: { kind: 'personal', id: row.personal_recording_id as number }
	return { id: row.id, target }
}

/** Révoquer, c'est supprimer : un lien révoqué n'a plus rien à garder. */
export async function deleteShareLink(id: number): Promise<void> {
	await sql`DELETE FROM share_links WHERE id = ${id}`
}

/** Ce qu'un visiteur anonyme voit d'un enregistrement — et rien de plus. */
export type SharedAudio = {
	linkId: number
	target: ShareTarget
	/** Relatif à AUDIO_DIR. Ne quitte jamais le serveur. */
	filePath: string
	title: string
	/** Prise du groupe : nom du groupe, date de session, numéro de prise. */
	group_id: number | null
	group_name: string | null
	/** Version du logo du groupe s'il en a un : l'image d'aperçu du lien. */
	logo_version: number | null
	session_date: string | null
	take: number | null
	/** Enregistrement perso : date d'ajout. */
	created_at: Date | null
	duration_s: number | null
	expires_at: Date
}

/**
 * Jeton → enregistrement, s'il est valide, non expiré, et que l'enregistrement a encore
 * une piste audio. Sinon `null`, sans distinguer les cas : un lien révoqué et un lien
 * inventé ne doivent pas se reconnaître.
 */
export async function resolveShareToken(token: string): Promise<SharedAudio | null> {
	if (!TOKEN_PATTERN.test(token)) return null
	const [row] = await sql<{
		id: number
		expires_at: Date
		recording_id: number | null
		personal_recording_id: number | null
		r_file: string | null
		r_duration: number | null
		take: number | null
		song_title: string | null
		session_date: string | null
		group_id: number | null
		group_name: string | null
		logo_version: number | null
		pr_file: string | null
		pr_duration: number | null
		pr_title: string | null
		pr_created: Date | null
	}[]>`
		SELECT
			sl.id, sl.expires_at, sl.recording_id, sl.personal_recording_id,
			r.file_path AS r_file, r.duration_s AS r_duration, r.take,
			s.title AS song_title, ses.date::text AS session_date, g.id AS group_id, g.name AS group_name,
			floor(EXTRACT(EPOCH FROM gl.updated_at))::float8 AS logo_version,
			pr.file_path AS pr_file, pr.duration_s AS pr_duration, pr.title AS pr_title,
			pr.created_at AS pr_created
		FROM share_links sl
		LEFT JOIN recordings r           ON r.id   = sl.recording_id
		LEFT JOIN songs s                ON s.id   = r.song_id
		LEFT JOIN sessions ses           ON ses.id = r.session_id
		LEFT JOIN groups g               ON g.id   = ses.group_id
		LEFT JOIN group_logos gl         ON gl.group_id = g.id
		LEFT JOIN personal_recordings pr ON pr.id  = sl.personal_recording_id
		WHERE sl.token_hash = ${hashToken(token)} AND sl.expires_at > now()
	`
	if (!row) return null

	if (row.recording_id !== null) {
		if (!row.r_file) return null
		return {
			linkId: row.id,
			target: { kind: 'recording', id: row.recording_id },
			filePath: row.r_file,
			title: row.song_title ?? 'Prise',
			group_id: row.group_id,
			group_name: row.group_name,
			logo_version: row.logo_version,
			session_date: row.session_date,
			take: row.take,
			created_at: null,
			duration_s: row.r_duration,
			expires_at: row.expires_at
		}
	}
	if (row.personal_recording_id === null || !row.pr_file) return null
	return {
		linkId: row.id,
		target: { kind: 'personal', id: row.personal_recording_id },
		filePath: row.pr_file,
		title: row.pr_title ?? 'Enregistrement',
		group_id: null,
		group_name: null,
		logo_version: null,
		session_date: null,
		take: null,
		created_at: row.pr_created,
		duration_s: row.pr_duration,
		expires_at: row.expires_at
	}
}

// Robots qui chargent la page pour fabriquer l'aperçu d'un lien collé dans une
// messagerie ou un réseau : ce ne sont pas des écoutes.
const PREVIEW_BOT = /facebookexternalhit|facebookcatalog|meta-externalagent|WhatsApp|Slackbot|Slack-ImgProxy|Discordbot|TelegramBot|Twitterbot|LinkedInBot|SkypeUriPreview|Iframely|Embedly|Google-PageRenderer|Applebot|bingbot|Googlebot|Signal/i

export function isPreviewBot(userAgent: string | null): boolean {
	return !!userAgent && PREVIEW_BOT.test(userAgent)
}

/** Dernière ouverture de la page d'écoute : dit aux membres si un lien sert encore. */
export async function markShareAccessed(linkId: number): Promise<void> {
	await sql`UPDATE share_links SET last_accessed_at = now() WHERE id = ${linkId}`
}

/**
 * Nom du fichier téléchargé. Le fichier sur disque s'appelle `{id}.mp3`, muet pour qui
 * le reçoit : on lui donne le titre, débarrassé de ce qu'un système de fichiers refuse.
 */
export function downloadFileName(shared: SharedAudio): string {
	const base = shared.take !== null ? `${shared.title} - prise ${shared.take}` : shared.title
	const safe = base.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim()
	return `${(safe || 'enregistrement').slice(0, 150)}.mp3`
}

/** `Content-Disposition` avec un repli ASCII pour les clients qui ignorent `filename*`. */
export function attachmentHeader(fileName: string): string {
	const ascii = fileName
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^\x20-\x7e]/g, '_')
		.replace(/["\\]/g, '')
	// `encodeURIComponent` laisse passer ' ( ) *, que la RFC 5987 n'admet pas en clair.
	const encoded = encodeURIComponent(fileName).replace(
		/['()*]/g,
		(c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
	)
	return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`
}
