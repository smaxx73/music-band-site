#!/usr/bin/env tsx
/**
 * Crée ou met à jour un utilisateur dans la base de données.
 *
 * Usage :
 *   npx tsx scripts/create-user.ts --name=<prénom> --password=<motdepasse> [--role=admin|user]
 *
 * Depuis Docker :
 *   docker compose exec app npx tsx scripts/create-user.ts --name=Alice --password=secret --role=admin
 */

import { randomBytes, scrypt, timingSafeEqual } from 'crypto'
import { promisify } from 'util'
import postgres from 'postgres'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const scryptAsync = promisify(scrypt)

async function hashPassword(password: string): Promise<string> {
	const salt = randomBytes(16).toString('hex')
	const hash = (await scryptAsync(password, salt, 64)) as Buffer
	return `${salt}:${hash.toString('hex')}`
}

function loadEnv() {
	try {
		const envPath = resolve(process.cwd(), '.env')
		const content = readFileSync(envPath, 'utf-8')
		for (const line of content.split('\n')) {
			const trimmed = line.trim()
			if (!trimmed || trimmed.startsWith('#')) continue
			const eq = trimmed.indexOf('=')
			if (eq === -1) continue
			const key = trimmed.slice(0, eq).trim()
			const value = trimmed.slice(eq + 1).trim()
			if (!process.env[key]) process.env[key] = value
		}
	} catch {
		// .env absent — on suppose que DATABASE_URL est déjà dans l'environnement
	}
}

function parseArgs(): { name: string; password: string; role: 'admin' | 'user' } {
	const args: Record<string, string> = {}
	for (const arg of process.argv.slice(2)) {
		const m = arg.match(/^--(\w+)=(.+)$/)
		if (m) args[m[1]] = m[2]
	}

	if (!args.name || !args.password) {
		console.error('Usage: npx tsx scripts/create-user.ts --name=<prénom> --password=<motdepasse> [--role=admin|user]')
		process.exit(1)
	}

	const role = args.role === 'admin' ? 'admin' : 'user'
	return { name: args.name.trim(), password: args.password, role }
}

async function main() {
	loadEnv()

	const databaseUrl = process.env.DATABASE_URL
	if (!databaseUrl) {
		console.error('Erreur : DATABASE_URL non défini.')
		process.exit(1)
	}

	const { name, password, role } = parseArgs()
	const sql = postgres(databaseUrl, { ssl: false })

	try {
		const hash = await hashPassword(password)
		const [user] = await sql`
			INSERT INTO users (name, password_hash, role)
			VALUES (${name}, ${hash}, ${role})
			ON CONFLICT (name) DO UPDATE
				SET password_hash = EXCLUDED.password_hash,
				    role          = EXCLUDED.role,
				    active        = true
			RETURNING id, name, role
		`
		console.log(`Utilisateur créé/mis à jour : ${user.name} (${user.role}) — id=${user.id}`)
	} finally {
		await sql.end()
	}
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})
