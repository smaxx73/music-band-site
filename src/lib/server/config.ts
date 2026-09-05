import { env } from '$env/dynamic/private'

function required(name: 'DATABASE_URL' | 'AUDIO_DIR' | 'AUTH_SECRET'): string {
	const value = env[name]?.trim()
	if (!value) throw new Error(`${name} doit être défini.`)
	return value
}

export function databaseUrl(): string {
	return required('DATABASE_URL')
}

export function audioDir(): string {
	return required('AUDIO_DIR')
}

export function authSecret(): string {
	const value = required('AUTH_SECRET')
	if (value.length < 32 || /changeme|chaine_aleatoire_longue/i.test(value)) {
		throw new Error('AUTH_SECRET doit être une valeur aléatoire unique d’au moins 32 caractères.')
	}
	return value
}
