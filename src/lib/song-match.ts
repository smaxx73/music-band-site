import { searchKey } from '$lib/search'
import { isPlaceholderSongTitle } from '$lib/songs'

/**
 * Morceau désigné par un nom de fichier : « 2025-03-12 Sunny v2.m4a », « sunny_prise3.wav »,
 * « WeWillRockYou-live.mp3 ». Seulement une proposition, que l'écran annonce : un faux
 * positif coûte un clic, un morceau à rechercher dans une longue liste à chaque envoi
 * en coûte davantage.
 */

/** Mots d'un nom, sans casse ni accents, coupés aux séparateurs, aux majuscules et aux chiffres. */
function words(text: string): string[] {
	return searchKey(
		text
			.replace(/(?<=\p{Ll})(?=\p{Lu})|(?<=\p{L})(?=\d)|(?<=\d)(?=\p{L})/gu, ' ')
	)
		.split(/[^\p{L}\d]+/u)
		.filter(Boolean)
}

/** Articles qu'un nom de fichier laisse souvent tomber : « The Wall » s'enregistre « wall ». */
const LEADING_ARTICLES = new Set(['the', 'a', 'an', 'le', 'la', 'les', 'l', 'un', 'une'])

/** Fautes tolérées : aucune sous 5 lettres, où une lettre change le mot (« rose », « rise »). */
function allowance(length: number): number {
	return length < 5 ? 0 : length < 9 ? 1 : 2
}

/** Distance d'édition, inversion de deux lettres voisines comptée pour une seule faute. */
function distance(a: string, b: string): number {
	const d = Array.from({ length: a.length + 1 }, (_, i) =>
		Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
	)
	for (let i = 1; i <= a.length; i++) {
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1
			d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
				d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
			}
		}
	}
	return d[a.length][b.length]
}

/**
 * Plus petite distance entre le titre et une suite de mots consécutifs du fichier, mots
 * recollés : « we_will_rock_you » comme « wewillrockyou » valent « We Will Rock You ».
 * Toujours des mots entiers — « sun » ne se trouve pas dans « sunny ».
 */
function bestDistance(target: string, fileWords: string[]): number | null {
	const max = allowance(target.length)
	let best: number | null = null
	for (let i = 0; i < fileWords.length; i++) {
		let joined = ''
		for (let j = i; j < fileWords.length; j++) {
			joined += fileWords[j]
			if (joined.length > target.length + max) break
			if (joined.length < target.length - max) continue
			const dist = distance(joined, target)
			if (dist <= max && (best === null || dist < best)) best = dist
		}
	}
	return best
}

export function songFromFileName<T extends { id: number; title: string }>(fileName: string, songs: T[]): T | null {
	const fileWords = words(fileName.replace(/\.[^.]+$/, ''))
	if (!fileWords.length) return null

	let best: { song: T; score: number } | null = null
	let tied = false
	for (const song of songs) {
		if (isPlaceholderSongTitle(song.title)) continue
		const titleWords = words(song.title)
		const variants = [titleWords]
		if (titleWords.length > 1 && LEADING_ARTICLES.has(titleWords[0])) variants.push(titleWords.slice(1))
		for (const variant of variants) {
			const target = variant.join('')
			// Deux lettres se retrouvent partout dans un nom de fichier.
			if (target.length < 3) continue
			const dist = bestDistance(target, fileWords)
			if (dist === null) continue
			// Lettres retrouvées : le titre le plus long l'emporte, faute comprise —
			// « sunny_afternon » est « Sunny Afternoon », pas « Sunny ».
			const score = target.length - dist
			if (!best || score > best.score) {
				best = { song, score }
				tied = false
			} else if (score === best.score && best.song.id !== song.id) {
				tied = true
			}
		}
	}
	// Deux morceaux aussi plausibles l'un que l'autre : mieux vaut ne rien proposer.
	return best && !tied ? best.song : null
}
