// Photo de bandeau d'une session : règles partagées par l'écran et le serveur.

/**
 * Intensité du voile sombre posé sur la photo, en pourcentage d'opacité au bord gauche
 * (là où se lit le titre). Le plancher garde le texte clair lisible sur une photo claire.
 */
export const SESSION_PHOTO_VEIL = { min: 20, max: 95, step: 5, default: 75 } as const

export const SESSION_PHOTO_MAX_BYTES = 8 * 1024 * 1024
export const SESSION_PHOTO_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif'

export type SessionPhoto = { version: number; veil: number }

/** Intensité valide, ou `null` : entier, dans les bornes, au pas du curseur. */
export function parseSessionPhotoVeil(value: unknown): number | null {
	const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
	if (typeof n !== 'number' || !Number.isInteger(n)) return null
	if (n < SESSION_PHOTO_VEIL.min || n > SESSION_PHOTO_VEIL.max) return null
	return n
}

export function sessionPhotoUrl(sessionId: number, version: number): string {
	return `/api/sessions/${sessionId}/photo?v=${version}`
}
