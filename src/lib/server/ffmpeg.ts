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
