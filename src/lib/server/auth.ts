import { createHmac, timingSafeEqual, randomBytes, scrypt } from 'crypto'
import { promisify } from 'util'

const scryptAsync = promisify(scrypt)

export async function hashPassword(password: string): Promise<string> {
	const salt = randomBytes(16).toString('hex')
	const hash = (await scryptAsync(password, salt, 64)) as Buffer
	return `${salt}:${hash.toString('hex')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
	const sep = stored.indexOf(':')
	if (sep === -1) return false
	const salt = stored.slice(0, sep)
	const hash = stored.slice(sep + 1)
	const hashBuffer = Buffer.from(hash, 'hex')
	const derived = (await scryptAsync(password, salt, 64)) as Buffer
	if (hashBuffer.length !== derived.length) return false
	return timingSafeEqual(hashBuffer, derived)
}

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
