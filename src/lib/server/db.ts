import postgres from 'postgres'
import { DATABASE_URL } from '$env/static/private'

const sql = postgres(DATABASE_URL, {
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
