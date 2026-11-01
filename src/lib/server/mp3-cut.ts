import { createReadStream, createWriteStream } from 'fs'
import { open, stat, writeFile } from 'fs/promises'
import { pipeline } from 'stream/promises'

/**
 * Coupe un mp3 de stockage en trois sur ses octets, aux frontières de trames, sans réencoder :
 * le passage écouté et ce qui l'entoure. Recollés, ils redonnent le fichier octet pour octet,
 * donc un recadrage se défait sans perte et ne duplique rien. Le fichier est parcouru par
 * petites fenêtres, jamais chargé en mémoire.
 *
 * Ne vaut que pour la sortie de `convertToMp3` : MPEG-1 Layer III, 44,1 kHz, stéréo.
 */

const SAMPLE_RATE = 44100
const SAMPLES_PER_FRAME = 1152
// Retard de l'encodeur, annoncé dans l'en-tête et retiré au décodage du fichier entier.
const ENCODER_DELAY = 1105
// Une trame s'appuie sur les précédentes (réservoir de bits) : les premières du passage
// sortent muettes ou abîmées. Démarrer un peu avant laisse intact ce qu'on a choisi d'entendre.
const PRE_ROLL_FRAMES = 2
const KBPS = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
// Le marqueur Info/Xing suit l'en-tête et les informations annexes d'une trame stéréo.
const INFO_TAG_OFFSET = 36
const WINDOW_BYTES = 64 * 1024

export type CutParts = { head: string; tail: string }
export type CutBounds = { startS: number; endS: number }

/** Où vit ce qui entoure le passage, à côté de son mp3. */
export function cutPartPaths(mp3Path: string): CutParts {
	const base = mp3Path.replace(/\.mp3$/, '')
	return { head: `${base}.head`, tail: `${base}.tail` }
}

function frameAt(seconds: number): number {
	return (seconds * SAMPLE_RATE + ENCODER_DELAY) / SAMPLES_PER_FRAME
}

function timeOfFrame(frame: number): number {
	return Math.max(0, (frame * SAMPLES_PER_FRAME - ENCODER_DELAY) / SAMPLE_RATE)
}

function frameLength(bytes: Uint8Array, at: number): number | null {
	// Synchro, MPEG-1, Layer III : 0xFF puis 0b1111101x.
	if (bytes[at] !== 0xff || (bytes[at + 1] & 0xfe) !== 0xfa) return null
	const kbps = KBPS[bytes[at + 2] >> 4]
	if (!kbps || ((bytes[at + 2] >> 2) & 3) !== 0) return null
	return Math.floor((144000 * kbps) / SAMPLE_RATE) + ((bytes[at + 2] >> 1) & 1)
}

/** Octets du passage dans le fichier, et ses bornes réelles dans le temps du fichier entier. */
export async function locateCut(
	path: string,
	bounds: CutBounds
): Promise<CutBounds & { startByte: number; endByte: number }> {
	const firstFrame = Math.max(0, Math.floor(frameAt(bounds.startS)) - PRE_ROLL_FRAMES)
	const endFrame = Math.ceil(frameAt(bounds.endS))

	const file = await open(path, 'r')
	try {
		const { size } = await file.stat()
		const window = Buffer.alloc(WINDOW_BYTES)
		let windowStart = 0
		let windowEnd = 0
		const peek = async (at: number): Promise<number> => {
			if (at < windowStart || at + INFO_TAG_OFFSET + 4 > windowEnd) {
				const { bytesRead } = await file.read(window, 0, WINDOW_BYTES, at)
				windowStart = at
				windowEnd = at + bytesRead
			}
			return at - windowStart
		}

		let position = 0
		let at = await peek(0)
		if (window.toString('latin1', at, at + 3) === 'ID3') {
			position = 10 + ((window[at + 6] << 21) | (window[at + 7] << 14) | (window[at + 8] << 7) | window[at + 9])
		}

		// La première trame peut n'être que l'en-tête Info : elle ne porte pas de son.
		at = await peek(position)
		const firstLength = frameLength(window, at)
		const tag = window.toString('latin1', at + INFO_TAG_OFFSET, at + INFO_TAG_OFFSET + 4)
		if (firstLength && (tag === 'Info' || tag === 'Xing')) position += firstLength

		let frame = 0
		let startByte = size
		let foundStart = false
		let endByte = size
		let lastFrame = endFrame
		while (position < size) {
			if (frame === firstFrame) {
				startByte = position
				foundStart = true
			}
			if (frame === endFrame) {
				endByte = position
				break
			}
			at = await peek(position)
			const length = frameLength(window, at)
			if (!length) {
				// Une étiquette en fin de fichier n'est pas de l'audio ; tout le reste serait un fichier inattendu.
				if (window.toString('latin1', at, at + 3) === 'TAG') {
					endByte = position
					break
				}
				throw new Error(`mp3 inattendu : pas de trame à l'octet ${position}`)
			}
			position += length
			frame += 1
		}
		if (position >= size || frame < endFrame) lastFrame = frame

		if (!foundStart || startByte >= endByte) {
			throw Object.assign(new Error('La coupe ne contient pas de son.'), { code: 'invalid_trim' })
		}
		return { startByte, endByte, startS: timeOfFrame(firstFrame), endS: timeOfFrame(lastFrame) }
	} finally {
		await file.close()
	}
}

async function copyRange(source: string, start: number, end: number, target: string): Promise<void> {
	if (start >= end) return writeFile(target, '')
	await pipeline(createReadStream(source, { start, end: end - 1 }), createWriteStream(target))
}

/** Écrit le passage dans `keptPath`, et ce qui l'entoure à côté (`cutPartPaths`). */
export async function splitMp3(wholePath: string, bounds: CutBounds, keptPath: string): Promise<CutBounds> {
	const { startByte, endByte, startS, endS } = await locateCut(wholePath, bounds)
	const { size } = await stat(wholePath)
	const { head, tail } = cutPartPaths(keptPath)
	await copyRange(wholePath, 0, startByte, head)
	await copyRange(wholePath, startByte, endByte, keptPath)
	await copyRange(wholePath, endByte, size, tail)
	return { startS, endS }
}

/** Recolle ces fichiers dans l'ordre, en flux. */
export async function joinFiles(paths: string[], target: string): Promise<void> {
	const output = createWriteStream(target)
	try {
		for (const path of paths) await pipeline(createReadStream(path), output, { end: false })
		await new Promise<void>((resolve, reject) => {
			output.once('error', reject)
			output.end(resolve)
		})
	} catch (err) {
		output.destroy()
		throw err
	}
}
