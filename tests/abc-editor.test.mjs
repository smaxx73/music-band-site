import { test } from 'node:test'
import assert from 'node:assert/strict'
import { moveAbcPitch } from '../src/lib/abc-editor.ts'

test('les flèches de hauteur traversent les octaves et gardent la durée', () => {
	assert.equal(moveAbcPitch('B2', 1), 'c2')
	assert.equal(moveAbcPitch('c/2', -1), 'B/2')
	assert.equal(moveAbcPitch('C', -1), 'B,')
	assert.equal(moveAbcPitch("b'3/2", 1), "c''3/2")
	assert.equal(moveAbcPitch('^F2', 1), '^G2')
	assert.equal(moveAbcPitch('^G2', -1), '^F2')
	assert.equal(moveAbcPitch('z2', 1), null)
	assert.equal(moveAbcPitch('|', -1), null)
})
