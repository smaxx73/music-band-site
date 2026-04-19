import type { RequestHandler } from './$types'
import { DATABASE_URL } from '$env/static/private'
import { spawn } from 'child_process'

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) return new Response('Non autorisé', { status: 401 })

	const date = new Date().toISOString().slice(0, 10)

	let buf: Buffer
	try {
		buf = await runPgDump(DATABASE_URL)
	} catch (err) {
		const msg = err instanceof Error ? err.message : 'Erreur inconnue'
		console.error('[backup]', msg)
		return new Response(`Erreur lors de la sauvegarde : ${msg}`, { status: 500 })
	}

	return new Response(buf, {
		headers: {
			'Content-Type': 'application/sql',
			'Content-Disposition': `attachment; filename="backup-${date}.sql"`,
			'Content-Length': String(buf.length)
		}
	})
}

function runPgDump(url: string): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const pg = spawn('pg_dump', [url])
		const chunks: Buffer[] = []
		const errChunks: Buffer[] = []

		pg.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
		pg.stderr.on('data', (chunk: Buffer) => errChunks.push(chunk))

		pg.on('error', (err) => reject(new Error(`pg_dump introuvable : ${err.message}`)))

		pg.on('close', (code) => {
			if (code === 0) {
				resolve(Buffer.concat(chunks))
			} else {
				const stderr = Buffer.concat(errChunks).toString().trim()
				reject(new Error(`pg_dump a échoué (code ${code}) : ${stderr}`))
			}
		})
	})
}
