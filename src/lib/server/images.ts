// Images déposées par les membres (logo de groupe, pochette de morceau).

export type ImageMime = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'

// Le type est lu dans les premiers octets, jamais repris du navigateur : c'est lui qui
// décide de ce qu'on accepte. SVG exclu — servi depuis notre origine, il pourrait
// embarquer du script.
export function detectImageMime(bytes: Uint8Array): ImageMime | null {
	const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end))
	if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(1, 4) === 'PNG') return 'image/png'
	if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
	if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp'
	if (bytes.length >= 6 && (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a')) return 'image/gif'
	return null
}

// Garde-fou avant de lire le corps : BODY_SIZE_LIMIT est réglé à 200 Mo pour l'audio,
// et formData() mettrait tout en mémoire. La marge couvre l'enveloppe multipart.
export function imageRequestTooLarge(request: Request, maxBytes: number): boolean {
	const length = Number(request.headers.get('content-length'))
	return Number.isFinite(length) && length > maxBytes + 64 * 1024
}
