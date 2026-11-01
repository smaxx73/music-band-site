import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cutPartPaths, joinFiles, locateCut, splitMp3 } from '../src/lib/server/mp3-cut.ts'

const FRAME_S = 1152 / 44100

/** Un faux mp3 : étiquette ID3, trame Info, puis des trames de 192 kbps, remplissage compris. */
function fakeMp3(frames, { id3 = true, info = true } = {}) {
	const frame = (index, tag) => {
		const padded = index % 3 === 0
		const body = Buffer.alloc(padded ? 627 : 626, index % 251)
		body.set([0xff, 0xfb, 0xb0 | (padded ? 2 : 0), 0x00])
		if (tag) body.write(tag, 36, 'latin1')
		return body
	}
	return Buffer.concat([
		...(id3 ? [Buffer.from('ID3\x04\x00\x00\x00\x00\x00\x05abcde', 'latin1')] : []),
		...(info ? [frame(0, 'Info')] : []),
		...Array.from({ length: frames }, (_, i) => frame(i + 1))
	])
}

async function withFile(bytes, run) {
	const dir = await mkdtemp(join(tmpdir(), 'mp3-cut-'))
	try {
		const whole = join(dir, 'whole.mp3')
		await writeFile(whole, bytes)
		await run(whole, dir)
	} finally {
		await rm(dir, { recursive: true, force: true })
	}
}

test('recollés, les trois morceaux redonnent le fichier octet pour octet', async () => {
	const bytes = fakeMp3(1000)
	await withFile(bytes, async (whole, dir) => {
		const kept = join(dir, 'kept.mp3')
		await splitMp3(whole, { startS: 5, endS: 20 }, kept)
		const { head, tail } = cutPartPaths(kept)
		const joined = join(dir, 'joined.mp3')
		await joinFiles([head, kept, tail], joined)
		assert.deepEqual(await readFile(joined), bytes)
	})
})

test('le passage commence et finit sur une frontière de trame', async () => {
	const bytes = fakeMp3(1000)
	await withFile(bytes, async (whole) => {
		const { startByte, endByte } = await locateCut(whole, { startS: 5, endS: 20 })
		for (const at of [startByte, endByte]) {
			assert.equal(bytes[at], 0xff)
			assert.equal(bytes[at + 1], 0xfb)
		}
	})
})

test("le passage démarre un peu avant la borne, pour que l'attaque choisie reste intacte", async () => {
	await withFile(fakeMp3(1000), async (whole) => {
		const { startS, endS } = await locateCut(whole, { startS: 5, endS: 20 })
		assert.ok(startS < 5 && startS > 5 - 4 * FRAME_S, `début réel ${startS}`)
		assert.ok(endS >= 20 && endS < 20 + 2 * FRAME_S, `fin réelle ${endS}`)
	})
})

test('un passage qui va au bout laisse une fin vide et rend la vraie fin', async () => {
	const bytes = fakeMp3(100)
	await withFile(bytes, async (whole, dir) => {
		const kept = join(dir, 'kept.mp3')
		const { endS } = await splitMp3(whole, { startS: 1, endS: 9999 }, kept)
		assert.equal((await readFile(cutPartPaths(kept).tail)).length, 0)
		assert.ok(endS < 100 * FRAME_S + FRAME_S)
	})
})

test('un fichier sans en-tête se coupe pareil', async () => {
	const bytes = fakeMp3(200, { id3: false, info: false })
	await withFile(bytes, async (whole, dir) => {
		const kept = join(dir, 'kept.mp3')
		await splitMp3(whole, { startS: 0, endS: 2 }, kept)
		const { head } = cutPartPaths(kept)
		assert.equal((await readFile(head)).length, 0)
	})
})

test('une coupe au-delà de la fin du son est refusée', async () => {
	await withFile(fakeMp3(100), async (whole) => {
		await assert.rejects(locateCut(whole, { startS: 500, endS: 600 }), { code: 'invalid_trim' })
	})
})

test("un fichier qui n'est pas le mp3 attendu échoue plutôt que de couper au hasard", async () => {
	await withFile(Buffer.concat([fakeMp3(10), Buffer.alloc(2000, 7)]), async (whole) => {
		await assert.rejects(locateCut(whole, { startS: 0, endS: 1 }), /mp3 inattendu/)
	})
})
