#!/usr/bin/env node
/**
 * Crée ou met à jour un utilisateur dans la base de données.
 * Usage : node scripts/create-user.mjs --nickname=Alice --password=secret --role=admin
 */
import { randomBytes, scrypt } from 'crypto'
import { promisify } from 'util'
import postgres from 'postgres'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const scryptAsync = promisify(scrypt)

async function hashPassword(password) {
	const salt = randomBytes(16).toString('hex')
	const hash = await scryptAsync(password, salt, 64)
	return `${salt}:${hash.toString('hex')}`
}

function loadEnv() {
	try {
		const content = readFileSync(resolve(process.cwd(), '.env'), 'utf-8')
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
		// Dans Docker, DATABASE_URL est fourni par l'environnement.
	}
}

function parseArgs() {
	const args = {}
	for (const arg of process.argv.slice(2)) {
		const match = arg.match(/^--(\w+)=(.+)$/)
		if (match) args[match[1]] = match[2]
	}
	if (!args.nickname || !args.password) {
		console.error('Usage: node scripts/create-user.mjs --nickname=<pseudo> --password=<motdepasse> [--role=admin|user]')
		process.exit(1)
	}
	return {
		nickname: args.nickname.trim(),
		password: args.password,
		role: args.role === 'admin' ? 'admin' : 'user'
	}
}

async function main() {
	loadEnv()
	if (!process.env.DATABASE_URL) {
		console.error('Erreur : DATABASE_URL non défini.')
		process.exit(1)
	}

	const { nickname, password, role } = parseArgs()
	const sql = postgres(process.env.DATABASE_URL, { ssl: false })
	try {
		const passwordHash = await hashPassword(password)
		const [user] = await sql`
			INSERT INTO users (nickname, password_hash, role)
			VALUES (${nickname}, ${passwordHash}, ${role})
			ON CONFLICT (nickname) DO UPDATE
				SET password_hash = EXCLUDED.password_hash,
					role = EXCLUDED.role,
					active = true
			RETURNING id, nickname, role
		`
		console.log(`Utilisateur créé/mis à jour : ${user.nickname} (${user.role}) — id=${user.id}`)
	} finally {
		await sql.end()
	}
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})
