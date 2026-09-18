/**
 * Contenu d'un commentaire → morceaux affichables.
 *
 * Un commentaire est du texte ordinaire, jamais du HTML : on le découpe ici et
 * l'écran rend chaque morceau avec la balise qui convient. Deux choses en sortent
 * du texte brut : les mentions (voir `$lib/mentions.ts`) et les liens — un lien
 * collé à la main ne se clique pas, et un lien YouTube a mieux à offrir qu'un
 * aller-retour vers un autre onglet.
 */

import { MENTION_PATTERN } from './mentions'
import { parseYouTubeStartSeconds, parseYouTubeVideoId } from './youtube'

export type CommentPart =
	| { kind: 'text'; text: string }
	| { kind: 'mention'; text: string }
	| { kind: 'link'; text: string; href: string }

export type CommentVideo = { videoId: string; startSeconds: number }

/**
 * Au-delà, un commentaire deviendrait un mur d'iframes : les liens restent
 * cliquables, seuls les premiers sont joués sur place.
 */
const MAX_EMBEDS = 3

// Une URL s'arrête au premier blanc. Les chevrons et guillemets sont exclus : ils
// encadrent parfois un lien collé, ils n'en font pas partie.
const URL_PATTERN = /https?:\/\/[^\s<>"'«»]+/gi

// Ponctuation posée par la phrase, pas par l'URL (« regarde https://… , c'est là »).
const TRAILING_PUNCTUATION = /[.,;:!?'"»…]+$/

/** Parenthèse finale : elle n'appartient au lien que s'il en ouvre une lui-même. */
function trimUrl(raw: string): string {
	let url = raw.replace(TRAILING_PUNCTUATION, '')
	while (/[)\]}]$/.test(url)) {
		const opening = url.slice(0, -1)
		const open = (opening.match(/[([{]/g) ?? []).length
		const close = (opening.match(/[)\]}]/g) ?? []).length
		if (open > close) break
		url = opening.replace(TRAILING_PUNCTUATION, '')
	}
	return url
}

/** Mentions d'un fragment sans lien, mises en évidence sans interpréter de HTML. */
function mentionParts(content: string): CommentPart[] {
	const parts: CommentPart[] = []
	let position = 0

	for (const match of content.matchAll(MENTION_PATTERN)) {
		const prefix = match[1]
		const mentionStart = (match.index ?? 0) + prefix.length
		if (mentionStart > position) parts.push({ kind: 'text', text: content.slice(position, mentionStart) })
		parts.push({ kind: 'mention', text: match[2] })
		position = mentionStart + match[2].length
	}

	if (position < content.length) parts.push({ kind: 'text', text: content.slice(position) })
	return parts
}

/** Découpe le contenu en texte, mentions et liens, dans l'ordre d'écriture. */
export function commentParts(content: string): CommentPart[] {
	const parts: CommentPart[] = []
	let position = 0

	for (const match of content.matchAll(URL_PATTERN)) {
		const start = match.index ?? 0
		const url = trimUrl(match[0])
		if (!url) continue

		if (start > position) parts.push(...mentionParts(content.slice(position, start)))
		parts.push({ kind: 'link', text: url, href: url })
		position = start + url.length
	}

	if (position < content.length) parts.push(...mentionParts(content.slice(position)))
	return parts.length ? parts : [{ kind: 'text', text: content }]
}

/**
 * Vidéos YouTube citées dans un commentaire, dans l'ordre et sans doublon : la même
 * vidéo collée deux fois n'ouvre qu'un lecteur, au repère de sa première mention.
 */
export function commentVideos(content: string): CommentVideo[] {
	const videos: CommentVideo[] = []
	const seen = new Set<string>()

	for (const part of commentParts(content)) {
		if (part.kind !== 'link') continue
		const videoId = parseYouTubeVideoId(part.href)
		if (!videoId || seen.has(videoId)) continue
		seen.add(videoId)
		videos.push({ videoId, startSeconds: parseYouTubeStartSeconds(part.href) })
		if (videos.length === MAX_EMBEDS) break
	}

	return videos
}
