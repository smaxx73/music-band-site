/**
 * Envoi d'un fichier audio depuis le navigateur, partagé par `/upload` (fichier choisi)
 * et `/record` (enregistrement fait sur place) : même route, mêmes erreurs, même suivi.
 */

export type DuplicateInfo = { id: number; take: number; session_date: string; song_title: string }

/** Le serveur a reconnu le fichier (ou la vidéo) : `409` avec la prise existante. */
export class DuplicateError extends Error {
	duplicate: DuplicateInfo
	constructor(duplicate: DuplicateInfo) {
		super('doublon')
		this.duplicate = duplicate
	}
}

/**
 * XMLHttpRequest plutôt que fetch : c'est le seul moyen de suivre la progression
 * de l'envoi, qui dure sur un fichier de plusieurs dizaines de Mo.
 */
export function sendAudioFile<T>(
	url: string,
	file: File,
	fields: Record<string, string>,
	onProgress?: (percent: number) => void
): Promise<T> {
	return new Promise((resolve, reject) => {
		const formData = new FormData()
		for (const [name, value] of Object.entries(fields)) formData.append(name, value)
		// Le fichier en dernier : les champs sont ainsi lus avant que le flux audio n'arrive.
		formData.append('audio', file)

		const xhr = new XMLHttpRequest()

		xhr.upload.onprogress = (e) => {
			if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100))
		}

		xhr.onload = () => {
			try {
				const data = JSON.parse(xhr.responseText)
				if (xhr.status === 409 && data.duplicate) {
					reject(new DuplicateError(data.duplicate))
				} else if (xhr.status >= 200 && xhr.status < 300) {
					resolve(data)
				} else {
					reject(new Error(data.error ?? `Erreur ${xhr.status}`))
				}
			} catch {
				if (xhr.status === 413) {
					reject(new Error('Fichier trop volumineux (maximum 200 Mo).'))
				} else {
					reject(new Error(`Réponse invalide du serveur (HTTP ${xhr.status}).`))
				}
			}
		}

		xhr.onerror = () => reject(new Error('Erreur réseau.'))

		xhr.open('POST', url)
		xhr.send(formData)
	})
}

/**
 * Écran de découpe d'un import. `titre` porte le titre commun déjà saisi pour un import
 * perso : sans lui, l'écran repartirait de son propre défaut et le titre tapé se perdrait.
 */
export function splitUrl(importId: string, title?: string): string {
	const trimmed = title?.trim()
	return trimmed ? `/decoupe/${importId}?titre=${encodeURIComponent(trimmed)}` : `/decoupe/${importId}`
}

export type NewSession = { date: string; type: string; title?: string; location?: string }

/** Crée une session à la volée ; lève une erreur lisible en cas d'échec. */
export async function createSession(session: NewSession): Promise<number> {
	const res = await fetch('/api/sessions', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ ...session, members: [] })
	})
	const json = await res.json().catch(() => ({}))
	if (!res.ok) throw new Error(json.error ?? 'Erreur création session.')
	return json.id
}
