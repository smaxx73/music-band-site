import sql from '$lib/server/db'

export type ScoreBlock = { id: number; type: 'chordpro' | 'notation'; label: string }
export type ScorePayload = { title: string; song_id: number | null; manifest: ScoreBlock[]; contents: Record<string, string> }

export function parseScorePayload(input: unknown): ScorePayload | null {
	if (!input || typeof input !== 'object') return null
	const value = input as Record<string, unknown>
	if (typeof value.title !== 'string' || !value.title.trim() || value.title.length > 200) return null
	if (value.song_id != null && (!Number.isSafeInteger(value.song_id) || (value.song_id as number) < 1)) return null
	if (!Array.isArray(value.manifest) || value.manifest.length < 1 || value.manifest.length > 100) return null
	if (!value.contents || typeof value.contents !== 'object' || Array.isArray(value.contents)) return null
	const contents = value.contents as Record<string, unknown>
	const ids = new Set<number>()
	for (const block of value.manifest) {
		if (!block || typeof block !== 'object') return null
		if (!Number.isSafeInteger(block.id) || block.id < 1 || ids.has(block.id)) return null
		if (block.type !== 'chordpro' && block.type !== 'notation') return null
		if (typeof block.label !== 'string' || block.label.length > 200) return null
		if (typeof contents[block.id] !== 'string' || (contents[block.id] as string).length > 250_000) return null
		ids.add(block.id)
	}
	return {
		title: value.title.trim(),
		song_id: (value.song_id as number | null) ?? null,
		manifest: value.manifest.map((block) => ({ id: block.id, type: block.type, label: block.label })),
		contents: Object.fromEntries([...ids].map((id) => [id, contents[id] as string]))
	}
}

export function validId(value: string): number | null {
	const id = Number(value)
	return Number.isSafeInteger(id) && id > 0 ? id : null
}

export async function accessibleDocument(id: number, userId: number, groupId: number | null, admin: boolean) {
	const [row] = await sql`
		SELECT d.id, d.song_id FROM score_documents d
		LEFT JOIN songs s ON s.id = d.song_id
		WHERE d.id = ${id} AND (
			(d.song_id IS NULL AND d.user_id = ${userId} AND ${admin})
			OR (d.song_id IS NOT NULL AND s.group_id = ${groupId})
		)
	`
	return row ?? null
}
