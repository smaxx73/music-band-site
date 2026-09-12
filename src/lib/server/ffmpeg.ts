import { spawn } from 'child_process'

/**
 * Convertit un fichier audio en mp3 128kbps avec suppression des silences.
 * Lecture depuis le disque, écriture sur le disque — jamais en mémoire Node.
 */
export function convertToMp3(inputPath: string, outputPath: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const ff = spawn('ffmpeg', [
			'-i', inputPath,
			'-ar', '44100',
			'-ab', '128k',
			'-ac', '2',
			'-af', [
				'silenceremove=start_periods=1:start_silence=0.1:start_threshold=-50dB',
				'areverse',
				'silenceremove=start_periods=1:start_silence=0.1:start_threshold=-50dB',
				'areverse'
			].join(','),
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
 * l'application (mp3 128 kbps). L'analyse a beau se faire sur le proxy, le rendu part
 * toujours du fichier déposé : c'est le seul endroit où la qualité se joue.
 *
 * Un encodage, pas deux : l'original n'a jamais été transcodé avant ce point.
 */
export function extractSegment(
	inputPath: string,
	outputPath: string,
	startS: number,
	durationS: number
): Promise<void> {
	return new Promise((resolve, reject) => {
		const ff = spawn('ffmpeg', [
			// `-ss` avant `-i` : recherche rapide puis décodage jusqu'au point exact,
			// indispensable sur un fichier d'une heure.
			'-ss', startS.toFixed(3),
			'-i', inputPath,
			'-t', durationS.toFixed(3),
			'-ar', '44100',
			'-ab', '128k',
			'-ac', '2',
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
