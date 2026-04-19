import type { RequestHandler } from './$types'
import { DATABASE_URL } from '$env/static/private'
import { spawn } from 'child_process'

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) return new Response('Non autorisé', { status: 401 })

	const date = new Date().toISOString().slice(0, 10)

	const pg = spawn('pg_dump', [DATABASE_URL])

	const stream = new ReadableStream({
		start(controller) {
			pg.stdout.on('data', (chunk: Buffer) => controller.enqueue(chunk))
			pg.stdout.on('end', () => controller.close())
			pg.on('error', (err) =>
				controller.error(new Error(`pg_dump introuvable : ${err.message}`))
			)
		},
		cancel() {
			pg.kill()
		}
	})

	return new Response(stream, {
		headers: {
			'Content-Type': 'application/sql',
			'Content-Disposition': `attachment; filename="backup-${date}.sql"`
		}
	})
}
