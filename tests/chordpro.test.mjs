import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chordProTitle, parseChordPro } from '../src/lib/chordpro.ts'

test('importe les variantes courantes de directives sans perdre les paroles', () => {
	const source = '\uFEFF{t: Mon morceau}\n{soc: Refrain}\n[C]Bonjour [G]tout le monde\n{eoc}\n{start-of-verse label="Couplet 2"}\n[Am]Suite\n{c: À deux voix}\n{key: Am}\n{chorus: Final}\n# note interne\n{directive_inconnue: garder}'
	assert.equal(chordProTitle(source), 'Mon morceau')
	const lines = parseChordPro(source)
	assert.deepEqual(lines.filter((line) => line.kind === 'section').map((line) => line.label), ['Refrain', 'Couplet 2', 'À deux voix', 'Final'])
	assert.deepEqual(lines.filter((line) => line.kind === 'line').map((line) => line.source), ['[C]Bonjour [G]tout le monde', '[Am]Suite', '{directive_inconnue: garder}'])
})
