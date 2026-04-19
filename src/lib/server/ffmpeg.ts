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
export function getDuration(filePath: string): Promise<number | null> {
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
				const s = parseFloat(data.format?.duration ?? '')
				resolve(isNaN(s) ? null : Math.round(s))
			} catch {
				resolve(null)
			}
		})

		ff.on('error', () => resolve(null))
	})
}
