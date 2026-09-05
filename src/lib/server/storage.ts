import { join } from 'path'
import { mkdir } from 'fs/promises'
import { audioDir } from '$lib/server/config'

export function audioPath(recordingId: number): string {
	return join(audioDir(), `${recordingId}.mp3`)
}

export async function ensureAudioDir(): Promise<void> {
	await mkdir(audioDir(), { recursive: true })
}
