import sql from './db'
import { notifyGroup } from './notifications'
import { fetchYouTubeVideoInfo } from './youtube'
import { parseYouTubeVideoId } from '$lib/youtube'
import {
	canDeleteGroupContent, canEditPost, postTitle,
	type PostType, type PostView, type ReactionSummary, type ReactionValue, type RoleBearer
} from '$lib/types'

// Une publication est groupe-scopée comme le reste du contenu : elle se lit, se
// commente et se supprime depuis le groupe où elle a été faite. Ce qu'elle montre
// d'un espace perso, elle le désigne sans le copier.

export type PostOpResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string }

function fail(status: number, error: string): PostOpResult<never> {
	return { ok: false, status, error }
}

const MESSAGE_MAX = 2000
const SONG_FIELD_MAX = 200

// La vidéo et son titre viennent de la publication, ou de l'enregistrement perso
// qu'elle montre : l'écran n'a pas à savoir d'où.
const VIEW_COLUMNS = sql`
	p.id, p.group_id, p.type, p.message,
	COALESCE(u.display_name, p.author) AS author, p.author_user_id,
	p.personal_recording_id,
	COALESCE(p.youtube_video_id, pr.youtube_video_id) AS youtube_video_id,
	COALESCE(p.youtube_title, pr.youtube_title)       AS youtube_title,
	p.song_title, p.song_artist, p.song_id, p.created_at, p.edited_at,
	pr.title                                AS recording_title,
	COALESCE(pr.file_path IS NOT NULL, false) AS recording_has_audio,
	pr.duration_s                           AS recording_duration_s
`

export async function getPost(id: number, groupId: number): Promise<PostView | null> {
	const [row] = await sql<PostView[]>`
		SELECT ${VIEW_COLUMNS}
		FROM posts p
		LEFT JOIN personal_recordings pr ON pr.id = p.personal_recording_id
		LEFT JOIN users u ON u.id = p.author_user_id
		WHERE p.id = ${id} AND p.group_id = ${groupId}
	`
	return row ?? null
}

export async function listRecentPosts(groupId: number, limit = 5): Promise<PostView[]> {
	return (await sql<PostView[]>`
		SELECT ${VIEW_COLUMNS}
		FROM posts p
		LEFT JOIN personal_recordings pr ON pr.id = p.personal_recording_id
		LEFT JOIN users u ON u.id = p.author_user_id
		WHERE p.group_id = ${groupId}
		ORDER BY p.created_at DESC, p.id DESC
		LIMIT ${limit}
	`) as unknown as PostView[]
}

/** Plusieurs publications d'un coup, pour le fil : l'ordre est celui du fil, pas d'ici. */
export async function listPostsByIds(ids: number[], groupId: number): Promise<PostView[]> {
	if (ids.length === 0) return []
	return (await sql<PostView[]>`
		SELECT ${VIEW_COLUMNS}
		FROM posts p
		LEFT JOIN personal_recordings pr ON pr.id = p.personal_recording_id
		LEFT JOIN users u ON u.id = p.author_user_id
		WHERE p.id = ANY(${ids}) AND p.group_id = ${groupId}
	`) as unknown as PostView[]
}

const NO_REACTION: ReactionSummary = { up_count: 0, down_count: 0, up_reactors: [], down_reactors: [], my_reaction: null }

/** Pouces de plusieurs publications, vus par `userId`. Une publication sans pouce n'a pas de ligne. */
export async function postReactions(ids: number[], userId: number): Promise<Map<number, ReactionSummary>> {
	if (ids.length === 0) return new Map()
	const rows = await sql<(ReactionSummary & { post_id: number })[]>`
		SELECT
			pr.post_id,
			COUNT(*) FILTER (WHERE pr.value = 1)::int  AS up_count,
			COUNT(*) FILTER (WHERE pr.value = -1)::int AS down_count,
			COALESCE(ARRAY_AGG(u.display_name ORDER BY u.display_name) FILTER (WHERE pr.value = 1),  ARRAY[]::TEXT[]) AS up_reactors,
			COALESCE(ARRAY_AGG(u.display_name ORDER BY u.display_name) FILTER (WHERE pr.value = -1), ARRAY[]::TEXT[]) AS down_reactors,
			MAX(pr.value) FILTER (WHERE pr.user_id = ${userId})::int AS my_reaction
		FROM post_reactions pr
		JOIN users u ON u.id = pr.user_id
		WHERE pr.post_id = ANY(${ids})
		GROUP BY pr.post_id
	`
	return new Map(rows.map(({ post_id, ...summary }) => [post_id, summary]))
}

export async function postReactionSummary(id: number, userId: number): Promise<ReactionSummary> {
	return (await postReactions([id], userId)).get(id) ?? NO_REACTION
}

/**
 * Pose (`value`) ou retire (`null`) le pouce de l'utilisateur. Tout membre du groupe le
 * peut : la publication doit seulement appartenir au groupe actif.
 */
export async function reactToPost(
	userId: number,
	id: number,
	groupId: number,
	value: ReactionValue | null
): Promise<PostOpResult<ReactionSummary>> {
	const [post] = await sql`SELECT id FROM posts WHERE id = ${id} AND group_id = ${groupId}`
	if (!post) return fail(404, 'Publication introuvable.')

	if (value === null) {
		await sql`DELETE FROM post_reactions WHERE post_id = ${id} AND user_id = ${userId}`
	} else {
		await sql`
			INSERT INTO post_reactions (post_id, user_id, value)
			VALUES (${id}, ${userId}, ${value})
			ON CONFLICT (post_id, user_id) DO UPDATE SET value = EXCLUDED.value
		`
	}
	return { ok: true, value: await postReactionSummary(id, userId) }
}

function cleanText(raw: unknown, max: number): string | null {
	if (typeof raw !== 'string') return null
	const value = raw.trim()
	return value ? value.slice(0, max) : null
}

/** Lien saisi → vidéo lisible. Pas de contrôle de doublon : une vidéo se recommande deux fois. */
async function resolveVideo(
	rawUrl: unknown
): Promise<PostOpResult<{ videoId: string; title: string | null }>> {
	const videoId = typeof rawUrl === 'string' ? parseYouTubeVideoId(rawUrl) : null
	if (!videoId) return fail(400, 'Lien YouTube non reconnu.')
	const info = await fetchYouTubeVideoInfo(videoId)
	if (!info.ok) return fail(400, info.error)
	return { ok: true, value: { videoId, title: info.title } }
}

type Actor = { id: number; display_name: string }

/**
 * Publie dans `groupId` — toujours le groupe actif de l'appelant. Le corps est validé
 * ici : c'est la seule porte d'entrée d'une publication.
 */
export async function createPost(
	actor: Actor,
	groupId: number,
	body: Record<string, unknown>
): Promise<PostOpResult<PostView>> {
	const type = body.type as PostType
	const message = cleanText(body.message, MESSAGE_MAX)

	let personalRecordingId: number | null = null
	let video: { videoId: string; title: string | null } | null = null
	let songTitle: string | null = null
	let songArtist: string | null = null

	if (type === 'recording') {
		const id = body.personal_recording_id
		if (typeof id !== 'number' || !Number.isInteger(id)) {
			return fail(400, 'personal_recording_id manquant ou invalide.')
		}
		// On ne publie que ce qu'on possède : l'enregistrement d'un autre n'existe pas.
		const [own] = await sql`SELECT id FROM personal_recordings WHERE id = ${id} AND user_id = ${actor.id}`
		if (!own) return fail(404, 'Enregistrement introuvable.')
		personalRecordingId = id
	} else if (type === 'youtube') {
		const resolved = await resolveVideo(body.video_url)
		if (!resolved.ok) return resolved
		video = resolved.value
	} else if (type === 'song_suggestion') {
		songTitle = cleanText(body.song_title, SONG_FIELD_MAX)
		if (!songTitle) return fail(400, 'Le titre du morceau est obligatoire.')
		songArtist = cleanText(body.song_artist, SONG_FIELD_MAX)
		// Le lien d'écoute est facultatif : sans lui, la suggestion est un simple titre.
		if (typeof body.video_url === 'string' && body.video_url.trim()) {
			const resolved = await resolveVideo(body.video_url)
			if (!resolved.ok) return resolved
			video = resolved.value
		}
	} else {
		return fail(400, 'type doit valoir recording, youtube ou song_suggestion.')
	}

	let createdId: number
	try {
		const [created] = await sql<{ id: number }[]>`
			INSERT INTO posts (
				group_id, type, message, author, author_user_id, personal_recording_id,
				youtube_video_id, youtube_title, song_title, song_artist
			)
			VALUES (
				${groupId}, ${type}, ${message}, ${actor.display_name}, ${actor.id}, ${personalRecordingId},
				${video?.videoId ?? null}, ${video?.title ?? null}, ${songTitle}, ${songArtist}
			)
			RETURNING id
		`
		createdId = created.id
	} catch (err) {
		if ((err as { code?: string }).code === '23505') {
			return fail(409, 'Cet enregistrement est déjà publié dans ce groupe.')
		}
		throw err
	}

	const post = (await getPost(createdId, groupId)) as PostView

	await notifyGroup({
		groupId,
		actor,
		type: 'post',
		subject: postTitle(post),
		excerpt: message,
		link: `/posts/${post.id}`,
		postId: post.id
	})

	return { ok: true, value: post }
}

export async function updatePostMessage(
	actor: RoleBearer,
	id: number,
	groupId: number,
	rawMessage: unknown
): Promise<PostOpResult<PostView>> {
	if (rawMessage !== null && typeof rawMessage !== 'string') return fail(400, 'message invalide.')
	const post = await getPost(id, groupId)
	if (!post) return fail(404, 'Publication introuvable.')
	if (!canEditPost(actor, post.author_user_id)) {
		return fail(403, "Seul l'auteur peut modifier cette publication.")
	}

	await sql`
		UPDATE posts SET message = ${cleanText(rawMessage, MESSAGE_MAX)}, edited_at = now()
		WHERE id = ${id} AND group_id = ${groupId}
	`
	return { ok: true, value: (await getPost(id, groupId)) as PostView }
}

/** Retire la publication, jamais l'enregistrement perso qu'elle montrait. */
export async function deletePost(
	actor: RoleBearer,
	id: number,
	groupId: number
): Promise<PostOpResult<{ id: number }>> {
	const post = await getPost(id, groupId)
	if (!post) return fail(404, 'Publication introuvable.')
	if (!canDeleteGroupContent(actor, groupId, post.author_user_id)) {
		return fail(403, "Seuls l'auteur et les admins du groupe peuvent supprimer cette publication.")
	}
	await sql`DELETE FROM posts WHERE id = ${id} AND group_id = ${groupId}`
	return { ok: true, value: { id } }
}

/**
 * Fait entrer une suggestion au référentiel, au statut `proposition_de_travail`.
 * Tout membre le peut, comme il peut ajouter un morceau depuis /songs. Le verrou sur
 * la publication empêche deux clics simultanés de créer deux morceaux.
 */
export async function addSuggestionToSongs(
	id: number,
	groupId: number
): Promise<PostOpResult<{ song_id: number }> | { ok: false; status: 409; error: string; song_id: number }> {
	return sql.begin(async (tx) => {
		const [post] = await tx<{ type: PostType; song_title: string | null; song_artist: string | null; song_id: number | null }[]>`
			SELECT type, song_title, song_artist, song_id FROM posts
			WHERE id = ${id} AND group_id = ${groupId}
			FOR UPDATE
		`
		if (!post) return fail(404, 'Publication introuvable.')
		if (post.type !== 'song_suggestion' || !post.song_title) {
			return fail(400, "Cette publication n'est pas une suggestion de morceau.")
		}
		if (post.song_id !== null) {
			return { ok: false as const, status: 409 as const, error: 'Ce morceau est déjà au référentiel.', song_id: post.song_id }
		}

		// Même unicité que /songs : le titre, sans tenir compte de la casse.
		const [existing] = await tx<{ id: number }[]>`
			SELECT id FROM songs WHERE group_id = ${groupId} AND lower(title) = lower(${post.song_title})
		`
		if (existing) {
			return { ok: false as const, status: 409 as const, error: 'Un morceau de ce titre existe déjà.', song_id: existing.id }
		}

		const [song] = await tx<{ id: number }[]>`
			INSERT INTO songs (group_id, title, original_artist, status)
			VALUES (${groupId}, ${post.song_title}, ${post.song_artist}, 'proposition_de_travail')
			RETURNING id
		`
		await tx`UPDATE posts SET song_id = ${song.id} WHERE id = ${id}`
		return { ok: true as const, value: { song_id: song.id } }
	}) as Promise<PostOpResult<{ song_id: number }> | { ok: false; status: 409; error: string; song_id: number }>
}
