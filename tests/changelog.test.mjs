import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseChangelog, compareVersions, entriesSince, splitInline } from '../src/lib/changelog-parse.ts'

const SOURCE = `# Changelog

## [Non publié]

- Pas encore sorti

## [1.2.0] — 2026-10-02

Migration à appliquer : \`040_x.sql\`.

- **Navigation** repensée
  sur deux lignes
- Seconde puce

## [1.1.1] — 2026-10-01

Aucune migration.

## [1.1.0] — 2026-09-27

- Première
`

test('seules les puces des versions publiées sont gardées, continuations jointes', () => {
	const entries = parseChangelog(SOURCE)
	assert.deepEqual(
		entries.map((e) => e.version),
		['1.2.0', '1.1.0']
	)
	assert.deepEqual(entries[0].items, ['**Navigation** repensée sur deux lignes', 'Seconde puce'])
	assert.equal(entries[0].date, '2026-10-02')
})

test('les versions se comparent en nombres, pas en texte', () => {
	assert.ok(compareVersions('1.10.0', '1.9.1') > 0)
	assert.equal(compareVersions('1.2.0', '1.2.0'), 0)
})

test('entriesSince exclut la version vue et ce qui dépasse la version en service', () => {
	const entries = parseChangelog(SOURCE)
	assert.deepEqual(entriesSince(entries, '1.1.0', '1.2.0').map((e) => e.version), ['1.2.0'])
	assert.deepEqual(entriesSince(entries, '1.2.0', '1.2.0'), [])
	assert.deepEqual(entriesSince(entries, '1.0.0', '1.1.0').map((e) => e.version), ['1.1.0'])
})

test('splitInline repère gras et code, le reste est du texte', () => {
	assert.deepEqual(splitInline('un **gras** et `code` fin'), [
		{ kind: 'text', text: 'un ' },
		{ kind: 'bold', text: 'gras' },
		{ kind: 'text', text: ' et ' },
		{ kind: 'code', text: 'code' },
		{ kind: 'text', text: ' fin' },
	])
	assert.deepEqual(splitInline('<b>x</b>'), [{ kind: 'text', text: '<b>x</b>' }])
})
