export type ChordProLine =
	| { kind: 'section'; label: string }
	| { kind: 'line'; source: string }
	| { kind: 'empty' }

const sections: Record<string, string> = {
	start_of_chorus: 'Refrain', soc: 'Refrain',
	start_of_verse: 'Couplet', sov: 'Couplet',
	start_of_bridge: 'Pont', sob: 'Pont',
	start_of_tab: 'Tablature', sot: 'Tablature',
	start_of_grid: 'Grille', sog: 'Grille'
}
const metadata = new Set(['title', 't', 'sorttitle', 'subtitle', 'st', 'artist', 'sortartist', 'composer', 'lyricist', 'copyright', 'album', 'year', 'key', 'time', 'tempo', 'duration', 'capo', 'tag', 'meta', 'define', 'chord', 'new_song', 'ns', 'end_of_chorus', 'eoc', 'end_of_verse', 'eov', 'end_of_bridge', 'eob', 'end_of_tab', 'eot', 'end_of_grid', 'eog'])

export function parseChordPro(source: string): ChordProLine[] {
	return source.replace(/^\uFEFF/, '').split(/\r?\n/).map((raw) => {
		const line = raw.trim()
		if (!line) return { kind: 'empty' }
		if (line.startsWith('#')) return { kind: 'empty' }
		const directive = line.match(/^\{\s*([a-z][\w-]*)(?:\s*:\s*|\s+)?(.*?)\s*\}$/i)
		if (!directive) return { kind: 'line', source: raw }
		const name = directive[1].toLowerCase().replace(/-/g, '_')
		const value = (directive[2] ?? '').trim().replace(/^label\s*=\s*(["'])(.*?)\1$/i, '$2')
		if (name in sections) return { kind: 'section', label: value || sections[name] }
		if (name === 'chorus') return { kind: 'section', label: value || 'Refrain' }
		if (name === 'comment' || name === 'c' || name === 'comment_italic' || name === 'ci' || name === 'comment_box' || name === 'cb' || name === 'highlight') {
			return value ? { kind: 'section', label: value } : { kind: 'empty' }
		}
		if (metadata.has(name)) return { kind: 'empty' }
		// Une directive inconnue reste visible : ne pas faire disparaître du contenu.
		return { kind: 'line', source: raw }
	})
}

export function chordProTitle(source: string): string | null {
	const match = source.replace(/^\uFEFF/, '').match(/^\{\s*(?:title|t)(?:\s*:\s*|\s+)([^}]+)\}/im)
	return match?.[1].trim() || null
}

/** Ce qu'une feuille montre en lecture : tout, ou la part de chaque musicien. */
export type SheetView = 'all' | 'lyrics' | 'chords'

export type LyricLine = { kind: 'section'; label: string } | { kind: 'lyrics'; text: string } | { kind: 'empty' }
export type ChordRow = { kind: 'section'; label: string } | { kind: 'chords'; chords: string[]; repeat: number } | { kind: 'empty' }

const CHORD = /\[([^\]]+)\]/g

/** Les accords d'une ligne, dans l'ordre où ils se jouent. */
export function lineChords(source: string): string[] {
	return [...source.matchAll(CHORD)].map((match) => match[1].trim()).filter(Boolean)
}

// Les blancs répétés de suite n'en font qu'un : retirer une ligne laisse sinon deux trous.
function collapseEmpty<T extends { kind: string }>(lines: T[]): T[] {
	return lines.filter((line, index) => line.kind !== 'empty' || (index > 0 && lines[index - 1].kind !== 'empty'))
}

export type ChartSection<T> = { heading: string | null; lines: T[] }

/**
 * Les lignes rangées sous leur titre de section. À l'impression, une section se garde
 * d'un tenant quand elle tient sur une page, et son titre ne reste jamais seul en bas.
 */
export function chartSections<T extends { kind: string; label?: string }>(lines: T[]): ChartSection<T>[] {
	const sections: ChartSection<T>[] = []
	for (const line of lines) {
		if (line.kind === 'section') sections.push({ heading: line.label ?? '', lines: [] })
		else if (sections.length) sections[sections.length - 1].lines.push(line)
		else sections.push({ heading: null, lines: [line] })
	}
	return sections
}

/**
 * Les paroles seules. Une ligne qui ne portait que des accords disparaît ; des accords
 * écrits sans crochets (« Intro : D G A ») ne se distinguent pas du texte et restent.
 */
export function lyricLines(source: string): LyricLine[] {
	return collapseEmpty(parseChordPro(source).flatMap((line): LyricLine[] => {
		if (line.kind !== 'line') return [line]
		const text = line.source.replace(CHORD, '').replace(/ {2,}/g, ' ').trimEnd()
		return text.trim() ? [{ kind: 'lyrics', text }] : []
	}))
}

/**
 * Les accords seuls, une rangée par ligne de paroles. ChordPro ne dit pas où tombent les
 * mesures : on garde l'ordre des accords, pas leur place dans la phrase. Les rangées
 * identiques qui se suivent n'en font qu'une (« ×2 »), comme on le dirait au groupe.
 */
export function chordRows(source: string): ChordRow[] {
	const rows: ChordRow[] = []
	for (const line of parseChordPro(source)) {
		if (line.kind !== 'line') { rows.push(line); continue }
		const chords = lineChords(line.source)
		if (!chords.length) continue
		const previous = rows.at(-1)
		if (previous?.kind === 'chords' && previous.chords.join(' ') === chords.join(' ')) previous.repeat++
		else rows.push({ kind: 'chords', chords, repeat: 1 })
	}
	return collapseEmpty(rows)
}
