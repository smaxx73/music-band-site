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
