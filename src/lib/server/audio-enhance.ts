import { copyFile, mkdir, readdir, rename, stat, unlink, utimes } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import sql from './db'
import { measureBandLevels, measureLoudness, renderFiltered } from './ffmpeg'
import { audioPath, originalAudioPath } from './storage'
import { forgetPeaks } from './peaks'
import {
	diagnose,
	enhancePlan,
	parseEnhanceSettings,
	parseSettingsKey,
	proposedSettings,
	sameSettings,
	settingsKey,
	type AudioAnalysis,
	type EnhancePlan,
	type EnhanceSettings,
	type EnhanceState,
	type EnhanceVersion,
	type SessionTake
} from '$lib/audio-enhance'

/**
 * Amélioration du son d'une prise : analyse, aperçu, application, retour à l'original.
 * Les réglages de la chaîne vivent dans `src/lib/audio-enhance.ts`, partagé avec l'écran.
 *
 * Trois états de fichiers :
 * - **original seul** — `{id}.mp3`, comme toute prise ;
 * - **aperçus** — en plus, une version améliorée par réglage essayé, dans le répertoire
 *   temporaire, nommée d'après ses réglages (`{id}.{clé}.mp3`). Personne ne les a encore
 *   gardées : elles n'ont rien à faire dans `AUDIO_DIR`, comme un import pas encore
 *   découpé. Revenir à un réglage déjà écouté, ou garder celui qu'on écoute, ne refait
 *   aucun rendu ;
 * - **amélioré** (`recordings.enhanced_at`) — `{id}.mp3` est la version améliorée, celle
 *   que jouent la barre du bas, les playlists et les liens d'écoute ; l'original est à
 *   côté, `{id}.original.mp3`, et se rétablit d'un geste. La version améliorée redevient
 *   alors un aperçu : la regarder à nouveau ne coûte rien.
 *
 * La source est le mp3 stocké : l'original déposé n'est pas conservé. C'est une génération
 * de compression de plus, à 192 kbps, inaudible face à ce que la chaîne corrige.
 */
const PREVIEW_DIR = join(tmpdir(), 'band-enhance')

/** Un aperçu ni gardé ni écarté au bout d'un jour ne sera plus écouté. */
const PREVIEW_TTL_MS = 24 * 60 * 60 * 1000

/**
 * Aperçus gardés par prise, les plus récents. Une hésitation se joue entre deux ou trois
 * réglages ; au-delà, on ne revient plus aux premiers, et chacun pèse le poids de la prise.
 */
const MAX_PREVIEWS_PER_TAKE = 6

/**
 * Le code de la chaîne ne change pas pendant la vie du serveur, et le répertoire des
 * aperçus ne lui survit pas (recréation du conteneur). Une version améliorée gardée avant
 * le démarrage a pu être rendue par une chaîne antérieure (autre loudness visée, autres
 * filtres) : la remettre parmi les aperçus la ferait garder de nouveau sous des réglages
 * qui ne la produisent plus.
 */
const SERVER_STARTED_AT = Date.now()

/**
 * Bornes du gain final, qui amène la sortie du compresseur à la loudness visée. Le gain
 * d'entrée a déjà fait l'essentiel : un écart plus grand trahirait une mesure aberrante.
 */
const MAX_POST_GAIN_DB = 12

/**
 * Bandes de l'équilibre aigu / grave (`AudioAnalysis.tilt_db`) : bas-médium et présence.
 * Mêmes filtres que pour le calibrage du dosage (`src/lib/audio-enhance.ts`) — les
 * changer déplacerait les seuils.
 */
const LOW_MID_BAND: [number, number] = [150, 500]
const PRESENCE_BAND: [number, number] = [2000, 6000]
const AIR_BAND: [number, null] = [6000, null]
const BASS_BAND: [number, number] = [40, 150]

/** Le limiteur ne travaille que sur les crêtes : une attaque courte, un relâchement bref. */
const LIMITER = 'attack=5:release=50:level=false:latency=true'

export type EnhanceTarget = {
	id: number
	session_id: number
	file_path: string | null
	audio_analysis: AudioAnalysis | null
	enhanced_at: Date | null
	enhanced_by: string | null
	enhancement: unknown
}

export type EnhanceOutcome = { ok: true } | { ok: false; status: number; error: string }

/** La prise, si elle appartient au groupe actif. */
export async function findEnhanceTarget(id: number, groupId: number): Promise<EnhanceTarget | null> {
	const [row] = await sql<EnhanceTarget[]>`
		SELECT r.id, r.session_id, r.file_path, r.audio_analysis, r.enhanced_at, r.enhancement, u.display_name AS enhanced_by
		FROM recordings r
		JOIN sessions ses ON ses.id = r.session_id
		LEFT JOIN users u ON u.id = r.enhanced_by_user_id
		WHERE r.id = ${id} AND ses.group_id = ${groupId}
	`
	return row ?? null
}

/** Le fichier qui porte le son d'origine, que la prise soit améliorée ou non. */
function originalFile(target: EnhanceTarget): string {
	return target.enhanced_at ? originalAudioPath(target.id) : audioPath(target.id)
}

/** Les réglages sont dans le nom : garder garde ce qu'on a écouté, sans fichier à côté. */
function previewPath(recordingId: number, settings: EnhanceSettings): string {
	return join(PREVIEW_DIR, `${recordingId}.${settingsKey(settings)}.mp3`)
}

/**
 * Mesure l'original, ou relit la mesure gardée en base. Elle n'est refaite que si le
 * fichier a changé de taille — un fichier retouché hors de l'application, par exemple
 * par `scripts/fix-single-channel.mjs`.
 */
export async function analyzeTarget(
	target: EnhanceTarget,
	{ background = false }: { background?: boolean } = {}
): Promise<AudioAnalysis | null> {
	const path = originalFile(target)
	const size = await stat(path).then((st) => st.size).catch(() => null)
	if (size === null) return null
	const cached = target.audio_analysis
	// Une mesure antérieure à l'équilibre aigu / grave n'a pas ces champs : elle est refaite.
	const complete = cached?.tilt_db !== undefined && cached?.air_db !== undefined && cached?.bass_db !== undefined
	if (cached?.source_bytes === size && complete) return cached

	// Deux membres qui ouvrent la même prise pas encore mesurée ne la décodent qu'une fois.
	let pending = measuring.get(target.id)
	if (!pending) {
		pending = measure(target.id, path, size, background).finally(() => measuring.delete(target.id))
		measuring.set(target.id, pending)
	}
	const analysis = await pending
	if (analysis) target.audio_analysis = analysis
	return analysis
}

const measuring = new Map<number, Promise<AudioAnalysis | null>>()

/** Entre deux prises du rattrapage : le serveur garde de quoi répondre pendant qu'il mesure. */
const BACKFILL_PAUSE_MS = 1000

/**
 * Mesure d'avance les prises qui n'ont pas de mesure à jour, une à la fois, les plus
 * récentes d'abord : sans cela, c'est le premier membre à ouvrir chacune qui attend la
 * mesure. Le calcul est le même, il change seulement de moment. Les prises déjà
 * améliorées sont laissées : leur mesure ne sert qu'à « Comparer », qu'on n'ouvre peut-être
 * jamais. Lancé au démarrage du serveur (`hooks.server.ts`) ; une fois à jour, il ne coûte
 * qu'une requête.
 */
export async function measurePendingRecordings(): Promise<void> {
	const targets = await sql<EnhanceTarget[]>`
		SELECT r.id, r.session_id, r.file_path, r.audio_analysis, r.enhanced_at, r.enhancement, NULL AS enhanced_by
		FROM recordings r
		WHERE r.file_path IS NOT NULL AND r.enhanced_at IS NULL
		  AND (r.audio_analysis IS NULL OR NOT (r.audio_analysis ?& array['tilt_db', 'air_db', 'bass_db']))
		ORDER BY r.created_at DESC
	`
	if (targets.length === 0) return
	console.log(`[enhance] mesure d'avance de ${targets.length} prise(s)`)
	let failed = 0
	for (const target of targets) {
		const analysis = await analyzeTarget(target, { background: true }).catch(() => null)
		if (!analysis) failed += 1
		await new Promise((resolve) => setTimeout(resolve, BACKFILL_PAUSE_MS))
	}
	console.log(`[enhance] mesure d'avance terminée${failed ? `, ${failed} fichier(s) illisible(s)` : ''}`)
}

async function measure(recordingId: number, path: string, size: number, background: boolean): Promise<AudioAnalysis | null> {
	const [measured, bands] = await Promise.all([
		measureLoudness(path, { truePeak: true, background }),
		measureBandLevels(path, [LOW_MID_BAND, PRESENCE_BAND, AIR_BAND, BASS_BAND], { background })
	])
	if (!measured) return null
	const relative = (level: number | undefined) => {
		if (!bands || level === undefined) return null
		const db = level - bands[0]
		return Number.isFinite(db) ? Math.round(db * 10) / 10 : null
	}
	const analysis: AudioAnalysis = {
		// Un fichier muet mesure −∞ : −70 est le plancher d'EBU R128, et JSON ne connaît pas l'infini.
		integrated_lufs: Number.isFinite(measured.integratedLufs) ? measured.integratedLufs : -70,
		lra_lu: Number.isFinite(measured.lraLu) ? measured.lraLu : 0,
		true_peak_dbtp: measured.truePeakDbtp,
		tilt_db: relative(bands?.[1]),
		air_db: relative(bands?.[2]),
		bass_db: relative(bands?.[3]),
		source_bytes: size
	}
	await sql`UPDATE recordings SET audio_analysis = ${sql.json(analysis)} WHERE id = ${recordingId}`
	return analysis
}

export async function enhanceState(target: EnhanceTarget): Promise<EnhanceState> {
	const analysis = await analyzeTarget(target)
	return {
		analysis,
		diagnosis: analysis ? diagnose(analysis) : null,
		proposed: analysis ? proposedSettings(analysis) : null,
		enhanced: target.enhanced_at
			? {
				at: new Date(target.enhanced_at).toISOString(),
				by: target.enhanced_by,
				settings: parseEnhanceSettings(target.enhancement)
			}
			: null,
		previews: target.enhanced_at ? [] : (await listPreviews(target)).map((p) => p.settings),
		session: await sessionTakes(target)
	}
}

/**
 * Les autres prises de la session qui ont une piste audio, et la dernière améliorée avec
 * des réglages connus. La session est celle de la prise, déjà vérifiée dans le groupe actif.
 */
async function sessionTakes(target: EnhanceTarget): Promise<EnhanceState['session']> {
	const rows = await sql<{ id: number; take: number; song_title: string; enhanced_at: Date | null; enhancement: unknown }[]>`
		SELECT r.id, r.take, s.title AS song_title, r.enhanced_at, r.enhancement
		FROM recordings r
		JOIN songs s ON s.id = r.song_id
		WHERE r.session_id = ${target.session_id} AND r.id <> ${target.id} AND r.file_path IS NOT NULL
		ORDER BY s.title, r.take
	`
	const others: SessionTake[] = rows.map((r) => ({
		id: r.id,
		take: r.take,
		song_title: r.song_title,
		enhanced: r.enhanced_at !== null
	}))
	let last: EnhanceState['session']['last'] = null
	let lastAt = 0
	for (const r of rows) {
		const settings = parseEnhanceSettings(r.enhancement)
		const at = r.enhanced_at ? new Date(r.enhanced_at).getTime() : 0
		if (settings && at > lastAt) {
			lastAt = at
			last = { id: r.id, take: r.take, song_title: r.song_title, enhanced: true, settings }
		}
	}
	return { others, last }
}

type Preview = { settings: EnhanceSettings; path: string; mtimeMs: number }

/**
 * Les aperçus de la prise qui valent pour son original actuel, le plus récent d'abord.
 * Un aperçu ne vaut que pour l'original dont il est tiré, donc plus récent que lui. Garder
 * puis revenir à l'original rend le même fichier, avec sa date d'origine (renommages) :
 * les aperçus tirés de lui restent valables.
 */
async function listPreviews(target: EnhanceTarget): Promise<Preview[]> {
	const source = await stat(originalFile(target)).catch(() => null)
	if (!source) return []
	const prefix = `${target.id}.`
	const names = (await readdir(PREVIEW_DIR).catch(() => [] as string[]))
		.filter((name) => name.startsWith(prefix) && name.endsWith('.mp3'))
	const previews: Preview[] = []
	for (const name of names) {
		const settings = parseSettingsKey(name.slice(prefix.length, -'.mp3'.length))
		if (!settings) continue
		const path = join(PREVIEW_DIR, name)
		const st = await stat(path).catch(() => null)
		if (st && st.mtimeMs >= source.mtimeMs) previews.push({ settings, path, mtimeMs: st.mtimeMs })
	}
	return previews.sort((a, b) => b.mtimeMs - a.mtimeMs)
}

async function findPreview(target: EnhanceTarget, settings: EnhanceSettings): Promise<string | null> {
	return (await listPreviews(target)).find((p) => sameSettings(p.settings, settings))?.path ?? null
}

/** Au-delà de `MAX_PREVIEWS_PER_TAKE`, les aperçus les plus anciens partent. */
async function prunePreviews(target: EnhanceTarget): Promise<void> {
	const previews = await listPreviews(target)
	for (const old of previews.slice(MAX_PREVIEWS_PER_TAKE)) await unlink(old.path).catch(() => {})
}

function fixed(value: number): string {
	return value.toFixed(2)
}

/** Gain d'entrée, coupe-bas, égalisation, compression, grave : tout ce qui précède la mesure. */
function shapingFilters(plan: EnhancePlan): string[] {
	const c = plan.compressor
	const filters = [
		`volume=${fixed(plan.pre_gain_db)}dB`,
		`highpass=f=${plan.highpass_hz}:poles=2`,
		...(plan.bass_boost ? [bandFilter(plan.bass_boost)] : []),
		...plan.eq.map(bandFilter)
	]
	if (c) filters.push(`acompressor=threshold=${c.threshold_db}dB:ratio=${c.ratio}:attack=${c.attack_ms}:release=${c.release_ms}`)
	// Après le compresseur : avant, il rendrait au grave une part de ce qu'on lui retire.
	if (plan.bass_cut) filters.push(bandFilter(plan.bass_cut))
	return filters
}

function bandFilter(band: EnhancePlan['eq'][number]): string {
	const filter = band.type === 'peak' ? 'equalizer' : band.type
	return `${filter}=f=${band.freq_hz}:t=q:w=${band.q}:g=${fixed(band.gain_db)}`
}

/**
 * Rend la version améliorée dans le répertoire temporaire. Deux passes : la première
 * mesure la loudness en sortie de compresseur, la seconde applique le gain qui l'amène à
 * la cible, puis le limiteur. Une normalisation en une passe (`loudnorm` dynamique)
 * pomperait sur un live ; mesurer d'abord donne un gain fixe sur tout le morceau.
 */
async function renderPreview(
	target: EnhanceTarget,
	analysis: AudioAnalysis,
	settings: EnhanceSettings
): Promise<void> {
	const plan = enhancePlan(analysis, settings)
	const source = audioPath(target.id)
	const shaping = shapingFilters(plan)

	const shaped = await measureLoudness(source, { filters: ['aformat=sample_fmts=dbl', ...shaping] })
	if (!shaped || !Number.isFinite(shaped.integratedLufs)) throw new Error('mesure impossible après traitement')
	const postGain = Math.min(MAX_POST_GAIN_DB, Math.max(-MAX_POST_GAIN_DB, plan.target_lufs - shaped.integratedLufs))

	await mkdir(PREVIEW_DIR, { recursive: true })
	void sweepStalePreviews()
	// Nom unique puis renommage : un aperçu à moitié écrit n'est jamais servi.
	const partial = join(PREVIEW_DIR, `${target.id}.${randomUUID()}.part`)
	try {
		await renderFiltered(source, partial, [
			...shaping,
			`volume=${fixed(postGain)}dB`,
			`alimiter=limit=${plan.limit_db}dB:${LIMITER}`
		])
		await rename(partial, previewPath(target.id, settings))
	} catch (err) {
		await unlink(partial).catch(() => {})
		throw err
	}
	await prunePreviews(target)
}

/** Un double clic, ou deux membres sur la même prise, ne rendent le même aperçu qu'une fois. */
const rendering = new Map<string, Promise<void>>()

/** Prépare l'aperçu à écouter avant de décider, avec les réglages choisis. */
export async function preparePreview(target: EnhanceTarget, settings: EnhanceSettings): Promise<EnhanceOutcome> {
	if (!target.file_path) return { ok: false, status: 400, error: 'Cette prise n’a pas de piste audio.' }
	if (target.enhanced_at) return { ok: false, status: 409, error: 'Le son de cette prise est déjà amélioré.' }
	const ready = await findPreview(target, settings)
	if (ready) {
		// Réécouté : il passe en tête, et ce n'est pas lui que l'élagage emportera.
		const now = new Date()
		await utimes(ready, now, now).catch(() => {})
		return { ok: true }
	}

	const analysis = await analyzeTarget(target)
	if (!analysis) return { ok: false, status: 500, error: 'Impossible d’analyser le fichier audio.' }
	if (!diagnose(analysis).enhanceable) {
		return { ok: false, status: 400, error: 'Cette prise est presque muette : il n’y a rien à améliorer.' }
	}
	const key = `${target.id}.${settingsKey(settings)}`
	let pending = rendering.get(key)
	if (!pending) {
		pending = renderPreview(target, analysis, settings).finally(() => rendering.delete(key))
		rendering.set(key, pending)
	}
	await pending
	return { ok: true }
}

/**
 * Garde la version améliorée : elle prend la place de `{id}.mp3`, l'original passe à
 * côté. L'aperçu est refait s'il n'existe pas, ou pas avec ces réglages : on garde ce
 * qu'on a choisi, jamais un aperçu préparé avec d'autres.
 *
 * Les fichiers changent dans la transaction, après l'écriture en base : un échec de
 * renommage annule la ligne, et les renommages déjà faits sont défaits. Un renommage
 * dans un même dossier est atomique — la prise n'est jamais servie à moitié écrite.
 */
export async function applyEnhancement(
	target: EnhanceTarget,
	userId: number,
	settings: EnhanceSettings
): Promise<EnhanceOutcome> {
	const prepared = await preparePreview(target, settings)
	if (!prepared.ok) return prepared

	// L'aperçu vit sur un autre système de fichiers (répertoire temporaire du conteneur) :
	// il est d'abord copié à côté de sa destination, pour que le remplacement soit un renommage.
	const staged = `${audioPath(target.id)}.enhanced.part`
	await copyFile(previewPath(target.id, settings), staged)

	try {
		const outcome: EnhanceOutcome = await sql.begin(async (tx) => {
			const [row] = await tx<{ enhanced_at: Date | null }[]>`
				SELECT enhanced_at FROM recordings WHERE id = ${target.id} FOR UPDATE
			`
			if (!row) return { ok: false as const, status: 404, error: 'Prise introuvable.' }
			if (row.enhanced_at) return { ok: false as const, status: 409, error: 'Le son de cette prise est déjà amélioré.' }

			await tx`
				UPDATE recordings
				SET enhanced_at = now(), enhanced_by_user_id = ${userId}, enhancement = ${tx.json(settings)}
				WHERE id = ${target.id}
			`
			await rename(audioPath(target.id), originalAudioPath(target.id))
			try {
				await rename(staged, audioPath(target.id))
			} catch (err) {
				await rename(originalAudioPath(target.id), audioPath(target.id))
				throw err
			}
			return { ok: true as const }
		})
		// Les autres aperçus restent : revenir à l'original les rend de nouveau valables.
		if (outcome.ok) {
			await unlink(previewPath(target.id, settings)).catch(() => {})
			await forgetPeaks(target.id)
		}
		return outcome
	} finally {
		await unlink(staged).catch(() => {})
	}
}

/**
 * Rétablit l'original. La version améliorée redevient un aperçu, si ses réglages sont
 * connus et qu'elle vient de la chaîne actuelle (`SERVER_STARTED_AT`) : on revient souvent
 * à l'original juste après pour comparer encore, ou en essayer d'autres.
 */
export async function revertEnhancement(target: EnhanceTarget): Promise<EnhanceOutcome> {
	const settings = parseEnhanceSettings(target.enhancement)
	if (settings && target.enhanced_at && new Date(target.enhanced_at).getTime() >= SERVER_STARTED_AT) {
		await keepAsPreview(target.id, settings)
	}

	const outcome: EnhanceOutcome = await sql.begin(async (tx) => {
		const [row] = await tx<{ enhanced_at: Date | null }[]>`
			SELECT enhanced_at FROM recordings WHERE id = ${target.id} FOR UPDATE
		`
		if (!row) return { ok: false as const, status: 404, error: 'Prise introuvable.' }
		if (!row.enhanced_at) return { ok: false as const, status: 409, error: 'Cette prise joue déjà son original.' }

		await tx`
			UPDATE recordings SET enhanced_at = NULL, enhanced_by_user_id = NULL, enhancement = NULL
			WHERE id = ${target.id}
		`
		// Remplace la version améliorée d'un seul geste ; original absent → la ligne reste.
		await rename(originalAudioPath(target.id), audioPath(target.id))
		return { ok: true as const }
	})
	if (outcome.ok) await forgetPeaks(target.id)
	return outcome
}

/** Copie la version améliorée parmi les aperçus. Un échec n'empêche pas de revenir à l'original. */
async function keepAsPreview(recordingId: number, settings: EnhanceSettings): Promise<void> {
	const partial = join(PREVIEW_DIR, `${recordingId}.${randomUUID()}.part`)
	try {
		await mkdir(PREVIEW_DIR, { recursive: true })
		await copyFile(audioPath(recordingId), partial)
		await rename(partial, previewPath(recordingId, settings))
	} catch {
		await unlink(partial).catch(() => {})
	}
}

/**
 * Le fichier d'une des deux versions, pour les comparer à l'écran. Avant amélioration,
 * la version améliorée est l'aperçu des réglages demandés ; après, c'est l'original qui
 * est à part.
 */
export async function versionFile(
	target: EnhanceTarget,
	version: EnhanceVersion,
	settings: EnhanceSettings | null
): Promise<string | null> {
	if (target.enhanced_at) return version === 'original' ? originalAudioPath(target.id) : audioPath(target.id)
	if (version === 'original') return audioPath(target.id)
	return settings ? findPreview(target, settings) : null
}

/** Écarte tous les aperçus d'une prise, sans attendre le balayage. */
export async function discardPreviews(recordingId: number): Promise<void> {
	const prefix = `${recordingId}.`
	const names = await readdir(PREVIEW_DIR).catch(() => [] as string[])
	for (const name of names) {
		if (name.startsWith(prefix) && name.endsWith('.mp3')) await unlink(join(PREVIEW_DIR, name)).catch(() => {})
	}
}

/** Balayage au fil des aperçus, comme les imports : pas de tâche planifiée pour si peu. */
async function sweepStalePreviews(): Promise<void> {
	const names = await readdir(PREVIEW_DIR).catch(() => [] as string[])
	const now = Date.now()
	for (const name of names) {
		const path = join(PREVIEW_DIR, name)
		const st = await stat(path).catch(() => null)
		if (st && now - st.mtimeMs > PREVIEW_TTL_MS) await unlink(path).catch(() => {})
	}
}
