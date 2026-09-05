import postgres from 'postgres'

// `process.env` est lu au démarrage du conteneur. La valeur de secours évite que
// l'analyse SvelteKit du build ouvre une connexion ou exige les secrets de prod.
const sql = postgres(process.env.DATABASE_URL ?? 'postgresql://invalid:invalid@localhost:5432/invalid', {
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
