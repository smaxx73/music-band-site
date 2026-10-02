#!/usr/bin/env node
/**
 * Rétablit le son au centre des fichiers déjà stockés dont un seul canal porte le son
 * (micro branché sur l'entrée 1 d'une carte son, entrée 2 vide) : le canal muet reçoit
 * une copie de l'autre. Les nouveaux dépôts sont corrigés à la conversion
 * (`src/lib/server/ffmpeg.ts`) ; ce script rattrape ceux d'avant.
 *
 * Usage :
 *   node scripts/fix-single-channel.mjs                  # liste seulement, ne modifie rien
 *   node scripts/fix-single-channel.mjs --apply          # corrige
 *   node scripts/fix-single-channel.mjs --apply --backup=/data/mono-backup
 *
 * Parcourt AUDIO_DIR (prises) et AUDIO_DIR/perso (enregistrements perso). Le mp3 est
 * réencodé à 128 kbps : une génération de compression de plus, d'où la sauvegarde
 * facultative des fichiers d'origine.
 */
import { spawn } from 'child_process'
import { readFileSync } from 'fs'
import { copyFile, mkdir, readdir, rename, unlink } from 'fs/promises'
import { join, resolve } from 'path'

// Mêmes seuils que `detectSingleChannel` (src/lib/server/ffmpeg.ts) : les garder alignés.
const SILENT_CHANNEL_RMS_DB = -60
const CHANNEL_GAP_DB = 30

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
		// Dans Docker, AUDIO_DIR est fourni par l'environnement.
	}
}

function parseArgs() {
	const args = { apply: false, backup: null }
	for (const arg of process.argv.slice(2)) {
		if (arg === '--apply') args.apply = true
		else if (arg.startsWith('--backup=')) args.backup = arg.slice('--backup='.length)
		else {
			console.error('Usage: node scripts/fix-single-channel.mjs [--apply] [--backup=<dossier>]')
			process.exit(1)
		}
	}
	return args
}

function run(args) {
	return new Promise((resolvePromise) => {
		const ff = spawn('ffmpeg', args)
		let stderr = ''
		ff.stderr.on('data', (d) => (stderr += d.toString()))
		ff.on('close', (code) => resolvePromise({ code, stderr }))
		ff.on('error', (err) => resolvePromise({ code: -1, stderr: String(err) }))
	})
}

async function detectSingleChannel(filePath) {
	const { code, stderr } = await run([
		'-hide_banner', '-nostats',
		'-i', filePath,
		'-map', '0:a:0',
		'-af', 'astats=measure_overall=none:measure_perchannel=RMS_level',
		'-f', 'null', '-'
	])
	if (code !== 0) return null
	const levels = [...stderr.matchAll(/RMS level dB:\s*(-?inf|-?[\d.]+)/g)]
		.map((m) => (m[1].endsWith('inf') ? -Infinity : parseFloat(m[1])))
	if (levels.length !== 2) return null
	const [left, right] = levels
	if (right <= SILENT_CHANNEL_RMS_DB && left - right >= CHANNEL_GAP_DB) return { active: 'left', left, right }
	if (left <= SILENT_CHANNEL_RMS_DB && right - left >= CHANNEL_GAP_DB) return { active: 'right', left, right }
	return null
}

async function listMp3(dir) {
	const entries = await readdir(dir).catch(() => [])
	return entries.filter((name) => /^\d+\.mp3$/.test(name)).map((name) => join(dir, name))
}

const formatDb = (db) => (db === -Infinity ? '-inf' : db.toFixed(1))

async function main() {
	loadEnv()
	const audioDir = process.env.AUDIO_DIR
	if (!audioDir) {
		console.error('Erreur : AUDIO_DIR non défini.')
		process.exit(1)
	}
	const { apply, backup } = parseArgs()

	const files = [...(await listMp3(audioDir)), ...(await listMp3(join(audioDir, 'perso')))]
	console.log(`${files.length} fichier(s) à analyser dans ${audioDir}`)

	let found = 0
	let fixed = 0
	for (const file of files) {
		const detection = await detectSingleChannel(file)
		if (!detection) continue
		found++
		const rel = file.slice(audioDir.length).replace(/^\/+/, '')
		console.log(`${rel} : son à ${detection.active === 'left' ? 'gauche' : 'droite'} seulement (G ${formatDb(detection.left)} dB, D ${formatDb(detection.right)} dB)`)
		if (!apply) continue

		if (backup) {
			const target = join(backup, rel)
			await mkdir(join(target, '..'), { recursive: true })
			await copyFile(file, target)
		}

		// Écrit à côté puis remplace d'un `rename` : une lecture en cours garde l'ancien
		// fichier, et un échec laisse l'original intact. Le nom ne correspond à aucune
		// prise, `/audio/` ne le sert donc jamais.
		const tmp = `${file}.fix.tmp`
		const source = detection.active === 'left' ? 'c0' : 'c1'
		const { code, stderr } = await run([
			'-v', 'error',
			'-i', file,
			'-af', `pan=stereo|c0=${source}|c1=${source}`,
			'-ar', '44100', '-b:a', '128k', '-ac', '2',
			'-f', 'mp3', '-y', tmp
		])
		if (code !== 0) {
			await unlink(tmp).catch(() => {})
			console.error(`  échec : ${stderr.slice(-300)}`)
			continue
		}
		await rename(tmp, file)
		// La forme d'onde en cache a été calculée sur l'ancien mixage : elle se refera.
		await unlink(file.replace(/\.mp3$/, '.peaks.json')).catch(() => {})
		fixed++
		console.log('  corrigé')
	}

	if (apply) console.log(`${fixed}/${found} fichier(s) corrigé(s).`)
	else console.log(`${found} fichier(s) concerné(s). Relancer avec --apply pour corriger.`)
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})
