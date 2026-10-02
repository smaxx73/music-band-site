import { spawn } from 'child_process'
import type { AudioTrim } from '$lib/types'

/**
 * Débit des mp3 stockés (prises, enregistrements perso, extraits de découpe). Constant et
 * non variable : en débit variable, certains navigateurs se positionnent mal dans le
 * fichier, et tout repose ici sur des repères (`?t=`, commentaires ancrés, préécoute).
 * Les fichiers d'avant le passage à 192k restent à 128k.
 */
const STORAGE_BITRATE = '192k'

/** Canal qui porte le son d'un fichier stéréo dont l'autre canal est muet. */
export type ActiveChannel = 'left' | 'right'

/**
 * Sous ce niveau RMS, un canal est muet : une entrée de carte son sans rien de branché
 * reste vers −90 dB, un micro branché même loin de la source dépasse largement −60 dB.
 */
const SILENT_CHANNEL_RMS_DB = -60
/** Écart minimal entre les deux canaux : un enregistrement simplement très calme n'est pas visé. */
const CHANNEL_GAP_DB = 30

/**
 * Repère un stéréo dont un seul canal porte le son : un micro branché sur l'entrée 1
 * d'une carte son, l'entrée 2 restée vide. Le fichier s'écoute alors dans une seule
 * oreille. Retourne le canal qui porte le son, ou null pour tout autre cas (mono,
 * vrai stéréo, plus de deux canaux, fichier illisible) — dans le doute, on ne touche à rien.
 *
 * Décode le fichier entier (filtre `astats`, rien n'est écrit) : un canal débranché
 * l'est pour toute la captation, un extrait ne suffirait pas à l'affirmer.
 */
export function detectSingleChannel(filePath: string): Promise<ActiveChannel | null> {
	return new Promise((resolve) => {
		const ff = spawn('ffmpeg', [
			'-hide_banner',
			'-nostats',
			'-i', filePath,
			'-map', '0:a:0',
			'-af', 'astats=measure_overall=none:measure_perchannel=RMS_level',
			'-f', 'null',
			'-'
		])

		let stderr = ''
		ff.stderr.on('data', (d: Buffer) => (stderr += d.toString()))

		ff.on('close', (code) => {
			if (code !== 0) { resolve(null); return }
			// Un niveau par canal, dans l'ordre ; un canal tout à zéro vaut `-inf`.
			const levels = [...stderr.matchAll(/RMS level dB:\s*(-?inf|-?[\d.]+)/g)]
				.map((m) => (m[1].endsWith('inf') ? -Infinity : parseFloat(m[1])))
			if (levels.length !== 2) { resolve(null); return }
			const [left, right] = levels
			if (right <= SILENT_CHANNEL_RMS_DB && left - right >= CHANNEL_GAP_DB) resolve('left')
			else if (left <= SILENT_CHANNEL_RMS_DB && right - left >= CHANNEL_GAP_DB) resolve('right')
			else resolve(null)
		})

		ff.on('error', () => resolve(null))
	})
}

/** Recopie le canal qui porte le son sur les deux sorties : le son revient au centre. */
export function duplicateChannelFilter(active: ActiveChannel): string {
	const source = active === 'left' ? 'c0' : 'c1'
	return `pan=stereo|c0=${source}|c1=${source}`
}

/**
 * Convertit un fichier audio en mp3 au débit de stockage (`STORAGE_BITRATE`). Sans coupe manuelle, les silences
 * aux extrémités sont aussi supprimés. Un canal muet est remplacé par l'autre
 * (`detectSingleChannel`).
 * Lecture depuis le disque, écriture sur le disque — jamais en mémoire Node.
 */
export async function convertToMp3(inputPath: string, outputPath: string, trim: AudioTrim | null = null): Promise<void> {
	const active = await detectSingleChannel(inputPath)
	const filters = [
		...(active ? [duplicateChannelFilter(active)] : []),
		// Une coupe manuelle garde exactement la portion choisie ; le rognage
		// automatique des silences ne sert qu'aux dépôts sans bornes.
		...(!trim ? [
			'silenceremove=start_periods=1:start_silence=0.1:start_threshold=-50dB',
			'areverse',
			'silenceremove=start_periods=1:start_silence=0.1:start_threshold=-50dB',
			'areverse'
		] : [])
	]
	return new Promise((resolve, reject) => {
		const ff = spawn('ffmpeg', [
			...(trim ? ['-ss', trim.startS.toFixed(3)] : []),
			'-i', inputPath,
			...(trim ? ['-t', (trim.endS - trim.startS).toFixed(3)] : []),
			'-ar', '44100',
			'-ab', STORAGE_BITRATE,
			'-ac', '2',
			...(filters.length > 0 ? ['-af', filters.join(',')] : []),
			'-f', 'mp3',
			'-y',
			outputPath
		])

		let stderr = ''
		ff.stderr.on('data', (d: Buffer) => (stderr += d.toString()))

		ff.on('close', (code) => {
			if (code === 0) resolve()
			else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-300)}`))
		})

		ff.on('error', reject)
	})
}

/**
 * Extrait les pics d'amplitude d'un fichier audio.
 * Retourne un tableau de `numPoints` valeurs entre 0 et 1.
 */
export function extractPeaks(filePath: string, numPoints = 1000): Promise<number[]> {
	return new Promise((resolve) => {
		const ff = spawn('ffmpeg', [
			'-i', filePath,
			'-ac', '1',
			'-filter:a', 'aresample=200',
			'-map', '0:a',
			'-c:a', 'pcm_f32le',
			'-f', 'f32le',
			'pipe:1'
		])

		const chunks: Buffer[] = []
		ff.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))

		ff.on('close', (code) => {
			if (code !== 0) { resolve([]); return }

			const buffer = Buffer.concat(chunks)
			const count = Math.floor(buffer.length / 4)
			const samples = new Float32Array(buffer.buffer, buffer.byteOffset, count)

			const blockSize = Math.max(1, Math.floor(count / numPoints))
			const peaks: number[] = []

			for (let i = 0; i < numPoints; i++) {
				let max = 0
				const start = i * blockSize
				for (let j = 0; j < blockSize && start + j < count; j++) {
					const abs = Math.abs(samples[start + j])
					if (abs > max) max = abs
				}
				peaks.push(max)
			}

			resolve(peaks)
		})

		ff.on('error', () => resolve([]))
	})
}

/** Retourne la durée en secondes entières via ffprobe, ou null si indisponible. */
export async function getDuration(filePath: string): Promise<number | null> {
	const exact = await getExactDuration(filePath)
	return exact === null ? null : Math.round(exact)
}

/**
 * Durée en secondes décimales — les bornes d'une découpe se calculent au dixième
 * près, l'arrondi de `getDuration` n'y suffit pas.
 */
export function getExactDuration(filePath: string): Promise<number | null> {
	return new Promise((resolve) => {
		const ff = spawn('ffprobe', [
			'-v', 'quiet',
			'-print_format', 'json',
			'-show_format',
			filePath
		])

		let out = ''
		ff.stdout.on('data', (d: Buffer) => (out += d.toString()))

		ff.on('close', (code) => {
			if (code !== 0) { resolve(null); return }
			try {
				const data = JSON.parse(out) as { format?: { duration?: string } }
				const seconds = parseFloat(data.format?.duration ?? '')
				resolve(isNaN(seconds) ? null : seconds)
			} catch {
				resolve(null)
			}
		})

		ff.on('error', () => resolve(null))
	})
}

/**
 * Intervalle silencieux détecté dans un fichier. `end` vaut null quand le fichier
 * se termine sur le silence : ffmpeg n'émet alors jamais le `silence_end`.
 */
export type Silence = { start: number; end: number | null }

export type SilenceDetectOptions = {
	/** Seuil en dB sous lequel le signal est considéré comme du silence (ex. -40). */
	thresholdDb: number
	/** Durée minimale d'un silence pour être signalé, en secondes. */
	minSilenceS: number
}

/**
 * Repère les passages silencieux via le filtre `silencedetect`.
 * ffmpeg n'écrit rien : `-f null` jette le flux décodé, seul stderr est lu.
 */
export function detectSilences(
	filePath: string,
	{ thresholdDb, minSilenceS }: SilenceDetectOptions
): Promise<Silence[]> {
	return new Promise((resolve, reject) => {
		const ff = spawn('ffmpeg', [
			'-hide_banner',
			'-nostats',
			'-i', filePath,
			'-af', `silencedetect=noise=${thresholdDb}dB:d=${minSilenceS}`,
			'-f', 'null',
			'-'
		])

		let stderr = ''
		ff.stderr.on('data', (d: Buffer) => (stderr += d.toString()))

		ff.on('close', (code) => {
			if (code !== 0) {
				reject(new Error(`ffmpeg silencedetect exited with code ${code}: ${stderr.slice(-300)}`))
				return
			}

			const silences: Silence[] = []
			for (const line of stderr.split('\n')) {
				const start = line.match(/silence_start:\s*(-?[\d.]+)/)
				if (start) {
					silences.push({ start: Math.max(0, parseFloat(start[1])), end: null })
					continue
				}
				const end = line.match(/silence_end:\s*([\d.]+)/)
				// Un `silence_end` sans `silence_start` ouvert ne peut pas être rattaché : ignoré.
				if (end && silences.length > 0 && silences[silences.length - 1].end === null) {
					silences[silences.length - 1].end = parseFloat(end[1])
				}
			}

			resolve(silences)
		})

		ff.on('error', reject)
	})
}

/**
 * Fabrique un proxy léger : mono, 22 kHz, 48 kbps. Il ne sert qu'à travailler —
 * détection des blancs, forme d'onde, préécoute — là où l'original serait inutilement
 * lourd à décoder et à transférer. Le rendu final ne part jamais de ce fichier.
 *
 * La propriété indispensable est l'**identité des échelles de temps** : une borne trouvée
 * ici doit valoir telle quelle dans l'original. D'où l'absence de toute coupe de silence,
 * contrairement à `convertToMp3` qui rogne les extrémités.
 *
 * Le délai d'encodage mp3 ne casse pas cette identité : l'en-tête LAME le décrit, et le
 * décodeur le retire. Mesuré sur un fichier de test, le début d'un blanc tombe à 20 µs
 * près au même endroit sur le proxy et sur l'original. Seule la fin est rallongée d'une
 * frame au plus (~50 ms), sans conséquence : la dernière borne est bornée à la durée.
 *
 * Replier à 11 kHz de bande passante atténue le souffle et les cymbales : les blancs en
 * ressortent un peu mieux, jamais moins bien.
 */
export function createProxy(inputPath: string, outputPath: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const ff = spawn('ffmpeg', [
			'-i', inputPath,
			'-ac', '1',
			'-ar', '22050',
			'-b:a', '48k',
			'-f', 'mp3',
			'-y',
			outputPath
		])

		let stderr = ''
		ff.stderr.on('data', (d: Buffer) => (stderr += d.toString()))

		ff.on('close', (code) => {
			if (code === 0) resolve()
			else reject(new Error(`ffmpeg proxy exited with code ${code}: ${stderr.slice(-300)}`))
		})

		ff.on('error', reject)
	})
}

/**
 * Taille un extrait dans l'ORIGINAL et l'encode aux réglages de stockage de
 * l'application (mp3, `STORAGE_BITRATE`). L'analyse a beau se faire sur le proxy, le rendu part
 * toujours du fichier déposé : c'est le seul endroit où la qualité se joue.
 *
 * Un encodage, pas deux : l'original n'a jamais été transcodé avant ce point.
 *
 * `active` recopie le canal qui porte le son sur l'autre, muet : détecté une fois sur
 * l'original entier par l'appelant (`detectSingleChannel`), pas extrait par extrait.
 */
export function extractSegment(
	inputPath: string,
	outputPath: string,
	startS: number,
	durationS: number,
	active: ActiveChannel | null = null
): Promise<void> {
	return new Promise((resolve, reject) => {
		const ff = spawn('ffmpeg', [
			// `-ss` avant `-i` : recherche rapide puis décodage jusqu'au point exact,
			// indispensable sur un fichier d'une heure.
			'-ss', startS.toFixed(3),
			'-i', inputPath,
			'-t', durationS.toFixed(3),
			'-ar', '44100',
			'-ab', STORAGE_BITRATE,
			'-ac', '2',
			...(active ? ['-af', duplicateChannelFilter(active)] : []),
			'-f', 'mp3',
			'-y',
			outputPath
		])

		let stderr = ''
		ff.stderr.on('data', (d: Buffer) => (stderr += d.toString()))

		ff.on('close', (code) => {
			if (code === 0) resolve()
			else reject(new Error(`ffmpeg extract exited with code ${code}: ${stderr.slice(-300)}`))
		})

		ff.on('error', reject)
	})
}

/**
 * Miniature JPEG carrée d'une image (logo de groupe, pochette de morceau), posée sur fond
 * blanc — un PNG transparent deviendrait noir en JPEG. Une image animée donne sa première
 * image. L'entrée passe en mémoire : une image de quelques Mo, pas un fichier audio.
 */
export function imageThumbnail(input: Buffer, size: number, fit: 'contain' | 'cover' = 'contain'): Promise<Buffer> {
	return imageFrame(input, size, size, fit)
}

/**
 * Même traitement dans un cadre quelconque (photo de bandeau d'une session). Le JPEG
 * produit ne porte aucune métadonnée de l'original : pas d'EXIF, donc pas de position GPS.
 * L'orientation EXIF d'une photo de téléphone, elle, est appliquée par ffmpeg au décodage.
 */
export function imageFrame(
	input: Buffer,
	width: number,
	height: number,
	fit: 'contain' | 'cover' = 'contain'
): Promise<Buffer> {
	// `contain` (logo) : l'image entière, centrée sur fond blanc — un logo ne se rogne pas.
	// `cover` (pochette, bandeau) : le cadre est rempli, les bords en trop sont coupés au
	// centre. Le fond blanc reste dessous pour la transparence.
	const scale = fit === 'cover'
		? `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`
		: `scale=${width}:${height}:force_original_aspect_ratio=decrease`
	return new Promise((resolve, reject) => {
		const ff = spawn('ffmpeg', [
			'-v', 'error',
			'-i', 'pipe:0',
			'-filter_complex', [
				`[0:v]${scale},format=rgba[fg]`,
				`color=c=white:s=${width}x${height}[bg]`,
				'[bg][fg]overlay=(W-w)/2:(H-h)/2:shortest=1,format=yuvj420p'
			].join(';'),
			'-frames:v', '1',
			// q 3 : ~25 Ko en 512 px, loin des ~300 Ko au-delà desquels WhatsApp renonce.
			'-q:v', '3',
			'-f', 'image2pipe',
			'-c:v', 'mjpeg',
			'pipe:1'
		])

		const chunks: Buffer[] = []
		let stderr = ''
		ff.stdout.on('data', (d: Buffer) => chunks.push(d))
		ff.stderr.on('data', (d: Buffer) => (stderr += d.toString()))
		// ffmpeg peut refermer l'entrée avant de l'avoir lue en entier (image illisible) :
		// l'erreur d'écriture n'apprend rien de plus que son code de sortie.
		ff.stdin.on('error', () => {})
		ff.stdin.end(input)

		ff.on('close', (code) => {
			const output = Buffer.concat(chunks)
			if (code === 0 && output.length > 0) resolve(output)
			else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-300)}`))
		})

		ff.on('error', reject)
	})
}
