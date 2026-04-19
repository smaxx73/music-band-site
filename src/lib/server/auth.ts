import { createHmac, timingSafeEqual } from 'crypto'

export function signCookie(value: string, secret: string): string {
	const sig = createHmac('sha256', secret).update(value).digest('base64url')
	return `${value}.${sig}`
}

export function verifyCookie(signed: string, secret: string): string | null {
	const lastDot = signed.lastIndexOf('.')
	if (lastDot === -1) return null

	const value = signed.slice(0, lastDot)
	const sig = signed.slice(lastDot + 1)

	if (!value) return null

	const expected = createHmac('sha256', secret).update(value).digest('base64url')

	try {
		const a = Buffer.from(sig)
		const b = Buffer.from(expected)
		if (a.length !== b.length) return null
		if (!timingSafeEqual(a, b)) return null
	} catch {
		return null
	}

	return value
}
