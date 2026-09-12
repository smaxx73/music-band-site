import { mkdir, readdir, rm, stat, unlink, writeFile, readFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import sql from './db'
import { detectSilences, extractPeaks, getExactDuration, type Silence } from './ffmpeg'
import {
	SPLIT_BOUNDS,
	SPLIT_DEFAULTS,
	type AudioImport,
	type AudioSegment,
	type SplitParams
} from '$lib/types'

/**
 * Zone de transit des outils audio d'après upload.
 *
 * Un import est un fichier déjà déposé mais pas encore devenu des prises. Ses octets
 * n'habitent volontairement PAS `AUDIO_DIR` : en production Caddy sert ce dossier tel
 * quel sous `/audio/`, sans passer par Node ni par l'authentification. Un fichier que
 * personne n'a encore validé n'a rien à y faire. Le répertoire temporaire du conteneur
 * convient : un import vit quelques minutes, le temps de la découpe.
 *
 * Chaque import tient en deux fichiers :
 * - **l'original**, conservé intact, dans lequel les prises seront taillées. C'est lui
 *   qui décide de la qualité du rendu, et il n'est transcodé qu'une fois, à la découpe ;
 * - **un proxy** léger (mono 22 kHz), sur lequel tout le travail se fait — détection des
 *   blancs, forme d'onde, préécoute. Décoder une heure d'audio à chaque relance
 *   d'analyse, ou la transférer au navigateur pour une écoute de cinq secondes, n'a
 *   aucune raison de se payer au tarif de l'original.
 *
 * Les deux partagent la même échelle de temps : une borne trouvée sur le proxy vaut
 * pour l'original (voir `createProxy`).
 */
const IMPORTS_DIR = join(tmpdir(), 'band-imports')

/** Au-delà, un import est considéré abandonné et balayé avec son fichier. */
const STALE_AFTER_MS = 24 * 60 * 60 * 1000

/**
 * Marge rendue à chaque segment de part et d'autre : `silencedetect` coupe au seuil,
 * ce qui mange l'attaque d'une note et la fin d'une résonance.
 */
const EDGE_PAD_S = 0.25

/** Nombre de points de la forme d'onde de survol affichée sur l'écran de découpe. */
const OVERVIEW_POINTS = 600

/**
 * L'original, tel que déposé. Sans extension à dessein : ffmpeg reconnaît le format au
 * contenu, et un nom construit à partir de celui du navigateur n'aurait rien à faire ici.
 */
export function sourcePath(id: string): string {
	return join(IMPORTS_DIR, `${id}.src`)
}

/** Le proxy de travail — analyse, forme d'onde, préécoute. */
export function proxyPath(id: string): string {
	return join(IMPORTS_DIR, `${id}.proxy.mp3`)
}

function peaksPath(id: string): string {
	return join(IMPORTS_DIR, `${id}.peaks.json`)
}

export async function ensureImportsDir(): Promise<void> {
	await mkdir(IMPORTS_DIR, { recursive: true })
}

/** Ramène chaque paramètre dans ses bornes — un réglage arrive du client. */
export function normalizeParams(raw: Partial<Record<keyof SplitParams, unknown>>): SplitParams {
	const clamp = (key: keyof SplitParams): number => {
		// `Number(null)` vaut 0 : un paramètre absent serait sinon pris pour un réglage
		// extrême au lieu de retomber sur la valeur par défaut.
		const given = raw[key]
		if (given === null || given === undefined || given === '') return SPLIT_DEFAULTS[key]
		const value = Number(given)
		if (!Number.isFinite(value)) return SPLIT_DEFAULTS[key]
		const { min, max } = SPLIT_BOUNDS[key]
		return Math.min(Math.max(value, min), max)
	}
	return {
		threshold_db: Math.round(clamp('threshold_db')),
		min_silence_s: Math.round(clamp('min_silence_s') * 10) / 10,
		min_segment_s: Math.round(clamp('min_segment_s'))
	}
}

/**
 * Complémentaire des silences dans `[0, duration]` : ce qui reste, c'est du son.
 * Fonction pure, séparée de ffmpeg pour rester lisible et vérifiable à la main.
 */
export function segmentsFromSilences(
	silences: Silence[],
	duration: number,
	minSegmentS: number
): AudioSegment[] {
	const segments: AudioSegment[] = []
	let cursor = 0

	const push = (start: number, end: number) => {
		const from = Math.max(0, start - EDGE_PAD_S)
		const to = Math.min(duration, end + EDGE_PAD_S)
		if (to - from >= minSegmentS && to > from) {
			segments.push({ start_s: round(from), end_s: round(to) })
		}
	}

	for (const silence of silences) {
		if (silence.start > cursor) push(cursor, silence.start)
		// Un silence non refermé court jusqu'à la fin du fichier : plus rien après lui.
		if (silence.end === null) return segments
		cursor = Math.max(cursor, silence.end)
	}

	if (cursor < duration) push(cursor, duration)
	return segments
}

function round(seconds: number): number {
	return Math.round(seconds * 100) / 100
}

// ─── Cycle de vie ─────────────────────────────────────────────────────────

export type CreateImportInput = {
	groupId: number
	userId: number
	sessionId: number | null
	fileName: string
	/** Type de l'original, tel que déposé — l'original est ce qui sera taillé. */
	sourceMime: string | null
	fileHash: string
	/** L'original et son proxy sont déjà écrits dans la zone de transit. */
	id: string
	durationS: number | null
}

export async function createImport(input: CreateImportInput): Promise<AudioImport> {
	const [row] = await sql<AudioImport[]>`
		INSERT INTO audio_imports (id, group_id, user_id, session_id, file_name, source_mime, file_hash, duration_s)
		VALUES (${input.id}, ${input.groupId}, ${input.userId}, ${input.sessionId},
		        ${input.fileName}, ${input.sourceMime}, ${input.fileHash}, ${input.durationS})
		RETURNING id, session_id, file_name, source_mime, duration_s, created_at
	`
	return row
}

/**
 * Charge un import en vérifiant qu'il appartient bien à celui qui le demande.
 * Un import est personnel : il n'est visible que de son déposant, dans le groupe où
 * il l'a déposé. Rien n'est encore publié, personne d'autre n'a à le voir.
 */
export async function loadImport(
	userId: number,
	groupId: number | null,
	id: string
): Promise<AudioImport | null> {
	if (!groupId || !isUuid(id)) return null
	const [row] = await sql<AudioImport[]>`
		SELECT id, session_id, file_name, source_mime, duration_s, created_at
		FROM audio_imports
		WHERE id = ${id} AND user_id = ${userId} AND group_id = ${groupId} AND consumed_at IS NULL
	`
	return row ?? null
}

export function isUuid(value: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

/**
 * Verrou d'unicité de la découpe : la ligne est réclamée avant tout travail, pour
 * qu'un double clic ne crée pas deux séries de prises. Libéré si la découpe échoue.
 */
export async function claimImport(userId: number, groupId: number, id: string): Promise<boolean> {
	if (!isUuid(id)) return false
	const [row] = await sql<{ id: string }[]>`
		UPDATE audio_imports SET consumed_at = now()
		WHERE id = ${id} AND user_id = ${userId} AND group_id = ${groupId} AND consumed_at IS NULL
		RETURNING id
	`
	return Boolean(row)
}

export async function releaseImport(id: string): Promise<void> {
	await sql`UPDATE audio_imports SET consumed_at = NULL WHERE id = ${id}`.catch(() => {})
}

/** Efface la ligne et les octets — après découpe réussie ou abandon explicite. */
export async function discardImport(id: string): Promise<void> {
	await sql`DELETE FROM audio_imports WHERE id = ${id}`
	await Promise.all([
		unlink(sourcePath(id)).catch(() => {}),
		unlink(proxyPath(id)).catch(() => {}),
		unlink(peaksPath(id)).catch(() => {})
	])
}

// ─── Analyse ──────────────────────────────────────────────────────────────

export type ImportAnalysis = {
	params: SplitParams
	segments: AudioSegment[]
	duration_s: number
}

export async function analyzeImport(id: string, params: SplitParams): Promise<ImportAnalysis> {
	// Sur le proxy : même échelle de temps que l'original, pour une fraction du décodage.
	const path = proxyPath(id)
	const duration = (await getExactDuration(path)) ?? 0
	const silences = await detectSilences(path, {
		thresholdDb: params.threshold_db,
		minSilenceS: params.min_silence_s
	})
	return {
		params,
		duration_s: round(duration),
		segments: segmentsFromSilences(silences, duration, params.min_segment_s)
	}
}

/**
 * Forme d'onde de survol du fichier en transit. Coûteuse sur une heure d'audio : le
 * résultat est gardé à côté du mp3, comme pour les prises (`peaks.ts`).
 */
export async function importPeaks(id: string): Promise<number[]> {
	try {
		return JSON.parse(await readFile(peaksPath(id), 'utf-8')) as number[]
	} catch {
		const peaks = await extractPeaks(proxyPath(id), OVERVIEW_POINTS)
		if (peaks.length > 0) writeFile(peaksPath(id), JSON.stringify(peaks)).catch(() => {})
		return peaks
	}
}

// ─── Ménage ───────────────────────────────────────────────────────────────

/**
 * Balaye les imports abandonnés. Appelé au dépôt d'un nouveau fichier : pas de tâche
 * planifiée à faire vivre pour un volume aussi faible.
 * N'échoue jamais — le ménage ne doit pas empêcher un upload.
 */
export async function sweepStaleImports(): Promise<void> {
	try {
		const cutoff = new Date(Date.now() - STALE_AFTER_MS)
		const stale = await sql<{ id: string }[]>`
			DELETE FROM audio_imports WHERE created_at < ${cutoff} RETURNING id
		`
		for (const row of stale) {
			await unlink(sourcePath(row.id)).catch(() => {})
			await unlink(proxyPath(row.id)).catch(() => {})
			await unlink(peaksPath(row.id)).catch(() => {})
		}

		// Fichiers sans ligne : restes d'un conteneur redémarré en cours d'import.
		const entries = await readdir(IMPORTS_DIR).catch(() => [] as string[])
		for (const entry of entries) {
			const full = join(IMPORTS_DIR, entry)
			const info = await stat(full).catch(() => null)
			if (info && Date.now() - info.mtimeMs > STALE_AFTER_MS) {
				await rm(full, { force: true }).catch(() => {})
			}
		}
	} catch (err) {
		console.error('[imports] ménage', err)
	}
}
