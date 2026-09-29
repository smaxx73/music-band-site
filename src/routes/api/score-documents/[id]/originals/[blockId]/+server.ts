import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import sql from '$lib/server/db'
import { strFromU8, unzipSync } from 'fflate'
import { isAdmin } from '$lib/types'
import { accessibleDocument, validId } from '$lib/server/score-documents'

function access(locals: App.Locals, id: string, blockId: string) {
	if (!locals.user) return { status: 401, error: 'Non autorisé' }
	const documentId = validId(id), originalBlockId = validId(blockId)
	if (!documentId || !originalBlockId) return { status: 400, error: 'ID invalide' }
	return { documentId, originalBlockId, userId: locals.user.id, groupId: locals.user.current_group_id, admin: isAdmin(locals.user.role) }
}

function decodeXml(bytes: Uint8Array): string {
	if (bytes[0] === 0xff && bytes[1] === 0xfe || bytes[0] === 0x3c && bytes[1] === 0) return new TextDecoder('utf-16le').decode(bytes)
	if (bytes[0] === 0xfe && bytes[1] === 0xff || bytes[0] === 0 && bytes[1] === 0x3c) return new TextDecoder('utf-16be').decode(bytes)
	return new TextDecoder('utf-8').decode(bytes)
}

export const POST: RequestHandler = async ({ locals, params, request }) => {
	const scope = access(locals, params.id, params.blockId)
	if ('error' in scope) return json({ error: scope.error }, { status: scope.status })
	if (!await accessibleDocument(scope.documentId, scope.userId, scope.groupId, scope.admin)) return json({ error: 'Document introuvable' }, { status: 404 })
	const [document] = await sql`SELECT manifest FROM score_documents WHERE id = ${scope.documentId}`
	if (!(document.manifest as { id: number; type: string }[]).some((block) => block.id === scope.originalBlockId && block.type === 'notation')) {
		return json({ error: 'Bloc de partition introuvable' }, { status: 404 })
	}
	if (Number(request.headers.get('content-length')) > 11 * 1024 * 1024) return json({ error: 'Fichier trop volumineux' }, { status: 413 })
	let data: FormData
	try { data = await request.formData() } catch { return json({ error: 'Envoi invalide' }, { status: 400 }) }
	const file = data.get('file')
	if (!(file instanceof File) || file.size < 1 || file.size > 10 * 1024 * 1024) return json({ error: 'Fichier invalide ou supérieur à 10 Mo' }, { status: 400 })
	const name = file.name.replace(/[\\/\x00-\x1f]/g, '_').slice(0, 200)
	const format = /\.mxl$/i.test(name) ? 'mxl' : /\.(musicxml|xml)$/i.test(name) ? 'musicxml' : null
	if (!format) return json({ error: 'Format MusicXML ou MXL attendu' }, { status: 400 })
	const content = Buffer.from(await file.arrayBuffer())
	if (format === 'mxl' && (content[0] !== 0x50 || content[1] !== 0x4b)) return json({ error: 'Archive MXL invalide' }, { status: 400 })
	if (format === 'musicxml' && !decodeXml(content.subarray(0, 10000)).match(/<(?:\?xml\b|score-(?:partwise|timewise)\b)/)) {
		return json({ error: 'Fichier MusicXML invalide' }, { status: 400 })
	}
	const warning = String(data.get('warning') ?? '').slice(0, 1000) || null
	await sql`
		INSERT INTO score_originals (document_id, block_id, file_name, format, warning, content)
		VALUES (${scope.documentId}, ${scope.originalBlockId}, ${name}, ${format}, ${warning}, ${content})
		ON CONFLICT (document_id, block_id) DO UPDATE SET
		file_name = EXCLUDED.file_name, format = EXCLUDED.format, warning = EXCLUDED.warning,
		content = EXCLUDED.content, created_at = now()
	`
	return json({ original: { block_id: scope.originalBlockId, file_name: name, format, warning } }, { status: 201 })
}

export const GET: RequestHandler = async ({ locals, params, url }) => {
	const scope = access(locals, params.id, params.blockId)
	if ('error' in scope) return json({ error: scope.error }, { status: scope.status })
	if (!await accessibleDocument(scope.documentId, scope.userId, scope.groupId, scope.admin)) return json({ error: 'Original introuvable' }, { status: 404 })
	const [original] = await sql`
		SELECT o.file_name, o.format, o.content FROM score_originals o
		WHERE o.document_id = ${scope.documentId} AND o.block_id = ${scope.originalBlockId}
	`
	if (!original) return json({ error: 'Original introuvable' }, { status: 404 })
	const download = url.searchParams.has('download')
	const safeName = String(original.file_name).replace(/["\\\r\n]/g, '_')
	let content: Uint8Array = original.content
	if (!download && original.format === 'mxl') {
		try {
			const archive = unzipSync(content)
			const container = archive['META-INF/container.xml']
			if (!container) throw new Error('Conteneur manquant')
			const path = strFromU8(container).match(/<rootfile\b[^>]*full-path\s*=\s*(["'])(.*?)\1/i)?.[2]
			if (!path || !archive[path]) throw new Error('Partition manquante')
			content = archive[path]
		} catch {
			return json({ error: 'Archive MXL illisible' }, { status: 422 })
		}
	}
	if (!download) content = Buffer.from(decodeXml(content), 'utf8')
	const responseBytes = new Uint8Array(content.byteLength)
	responseBytes.set(content)
	return new Response(responseBytes.buffer, {
		headers: {
			'Content-Type': download ? 'application/octet-stream' : 'text/plain; charset=utf-8',
			'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${download ? safeName : safeName.replace(/\.mxl$/i, '.musicxml')}"`,
			'Content-Security-Policy': 'sandbox',
			'Cache-Control': 'private, no-store'
		}
	})
}
