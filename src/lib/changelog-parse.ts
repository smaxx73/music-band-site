// Lecture du CHANGELOG.md : pur (sans import Vite) pour rester testable par `pnpm test`.

export type ChangelogEntry = { version: string; date: string; items: string[] }

export type InlinePart = { kind: 'text' | 'bold' | 'code'; text: string }

const HEADING = /^## \[(\d+\.\d+\.\d+)\] — (\d{4}-\d{2}-\d{2})\s*$/

/**
 * Ne garde que les puces de chaque version publiée. Le paragraphe qui précède (migrations,
 * variables d'environnement) s'adresse à qui déploie, pas aux membres : il est écarté.
 * « [Non publié] » ne correspond pas à HEADING et clôt la version précédente.
 */
export function parseChangelog(source: string): ChangelogEntry[] {
	const entries: ChangelogEntry[] = []
	let current: ChangelogEntry | null = null
	let inItem = false

	for (const line of source.split(/\r?\n/)) {
		if (line.startsWith('## ')) {
			const match = HEADING.exec(line)
			current = match ? { version: match[1], date: match[2], items: [] } : null
			if (current) entries.push(current)
			inItem = false
		} else if (!current) {
			continue
		} else if (line.startsWith('- ')) {
			current.items.push(line.slice(2).trim())
			inItem = true
		} else if (inItem && /^\s+\S/.test(line)) {
			current.items[current.items.length - 1] += ` ${line.trim()}`
		} else {
			inItem = false
		}
	}
	return entries.filter((entry) => entry.items.length > 0)
}

export function compareVersions(a: string, b: string): number {
	const left = a.split('.').map(Number)
	const right = b.split('.').map(Number)
	for (let i = 0; i < 3; i++) {
		const diff = (left[i] ?? 0) - (right[i] ?? 0)
		if (diff !== 0) return diff
	}
	return 0
}

/** Les versions publiées après `seen`, jusqu'à `current` comprise, la plus récente d'abord. */
export function entriesSince(
	entries: ChangelogEntry[],
	seen: string,
	current: string
): ChangelogEntry[] {
	return entries.filter(
		(entry) => compareVersions(entry.version, seen) > 0 && compareVersions(entry.version, current) <= 0
	)
}

/** **gras** et `code` seulement : le texte reste du texte, jamais du HTML. */
export function splitInline(text: string): InlinePart[] {
	const parts: InlinePart[] = []
	for (const chunk of text.split(/(\*\*[^*]+\*\*|`[^`]+`)/)) {
		if (!chunk) continue
		if (chunk.startsWith('**') && chunk.endsWith('**') && chunk.length > 4) {
			parts.push({ kind: 'bold', text: chunk.slice(2, -2) })
		} else if (chunk.startsWith('`') && chunk.endsWith('`') && chunk.length > 2) {
			parts.push({ kind: 'code', text: chunk.slice(1, -1) })
		} else {
			parts.push({ kind: 'text', text: chunk })
		}
	}
	return parts
}
