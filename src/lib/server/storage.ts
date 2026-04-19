import { AUDIO_DIR } from '$env/static/private'
import { join } from 'path'
import { mkdir } from 'fs/promises'

export function audioPath(recordingId: number): string {
	return join(AUDIO_DIR, `${recordingId}.mp3`)
}

export async function ensureAudioDir(): Promise<void> {
	await mkdir(AUDIO_DIR, { recursive: true })
}
