import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'
import sql from '$lib/server/db'
import { audioPath } from '$lib/server/storage'
import { unlink } from 'fs/promises'

export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return json({ error: 'Non autorisé' }, { status: 401 })

	const id = parseInt(params.id)
	if (isNaN(id)) return json({ error: 'ID invalide.' }, { status: 400 })

	const [recording] = await sql`DELETE FROM recordings WHERE id = ${id} RETURNING id, file_path`
	if (!recording) return json({ error: 'Prise introuvable.' }, { status: 404 })

	// Supprimer le fichier audio — erreur non fatale (fichier peut déjà être absent)
	try {
		await unlink(audioPath(id))
	} catch {
		// fichier absent ou inaccessible, on continue
	}

	return json({ success: true })
}
