import { test } from 'node:test'
import assert from 'node:assert/strict'
import { splitAtTrim } from '../src/lib/server/trim-segments.ts'

const trim = { startS: 20, endS: 100 }

test('une borne coupe le segment qui la chevauche, et ce qui dépasse part écarté', () => {
	assert.deepEqual(splitAtTrim([{ start_s: 0, end_s: 120 }], trim, 10), [
		{ start_s: 0, end_s: 20, outside_trim: true },
		{ start_s: 20, end_s: 100 },
		{ start_s: 100, end_s: 120, outside_trim: true }
	])
})

test('un segment entier hors du passage part écarté, un segment dedans ne bouge pas', () => {
	assert.deepEqual(
		splitAtTrim([{ start_s: 2, end_s: 15 }, { start_s: 30, end_s: 60 }, { start_s: 105, end_s: 118 }], trim, 10),
		[
			{ start_s: 2, end_s: 15, outside_trim: true },
			{ start_s: 30, end_s: 60 },
			{ start_s: 105, end_s: 118, outside_trim: true }
		]
	)
})

test('hors du passage, même un bout trop court pour une prise reste proposé', () => {
	assert.deepEqual(splitAtTrim([{ start_s: 5, end_s: 7 }], trim, 10), [{ start_s: 5, end_s: 7, outside_trim: true }])
})

test('dans le passage, la longueur minimale de toute découpe reste la règle', () => {
	assert.deepEqual(splitAtTrim([{ start_s: 40, end_s: 45 }], trim, 10), [])
})

test('un segment qui finit pile sur une borne ne laisse pas de morceau vide', () => {
	assert.deepEqual(splitAtTrim([{ start_s: 0, end_s: 20 }, { start_s: 20, end_s: 100 }], trim, 10), [
		{ start_s: 0, end_s: 20, outside_trim: true },
		{ start_s: 20, end_s: 100 }
	])
})
