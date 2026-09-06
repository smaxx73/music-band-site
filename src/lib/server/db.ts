import postgres from 'postgres'
import { building } from '$app/environment'
import { databaseUrl } from '$lib/server/config'

// Pendant l'analyse SvelteKit du build, aucune base n'est disponible ni requise.
// En développement et à l'exécution du conteneur, `databaseUrl` lit le .env
// via l'environnement dynamique de SvelteKit.
const sql = postgres(building ? 'postgresql://invalid:invalid@localhost:5432/invalid' : databaseUrl(), {
	ssl: false,
	types: {
		// Keep PostgreSQL DATE values as YYYY-MM-DD strings.
		date_only: {
			to: 1082,
			from: [1082],
			serialize: (value: string | Date) =>
				value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10),
			parse: (value: string) => value
		}
	}
})

export default sql
