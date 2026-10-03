import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
	diagnose,
	enhancePlan,
	eqAmount,
	formatDb,
	parseEnhanceSettings,
	proposedSettings
} from '../src/lib/audio-enhance.ts'

const measure = (integrated_lufs, lra_lu = 8, true_peak_dbtp = -3, tilt_db = -9, air_db = -26) =>
	({ integrated_lufs, lra_lu, true_peak_dbtp, tilt_db, air_db, source_bytes: 1 })

test('un son faible ou très fort est signalé, un son correct ne l’est pas', () => {
	assert.deepEqual(diagnose(measure(-29)).issues.map((i) => i.kind), ['quiet'])
	assert.deepEqual(diagnose(measure(-10)).issues.map((i) => i.kind), ['loud'])
	assert.equal(diagnose(measure(-17)).recommended, false)
	assert.equal(diagnose(measure(-17)).enhanceable, true)
})

test('une saturation se signale sans suffire à proposer l’amélioration', () => {
	const d = diagnose(measure(-17, 8, 0.3))
	assert.deepEqual(d.issues.map((i) => i.kind), ['saturated'])
	assert.equal(d.issues[0].fixable, false)
	assert.equal(d.recommended, false)
})

test('un fichier quasi muet n’est pas améliorable', () => {
	const d = diagnose(measure(-70, 0, null))
	assert.equal(d.enhanceable, false)
	assert.equal(d.recommended, false)
	assert.deepEqual(d.issues, [])
})

test('le gain d’entrée amène au niveau de travail, dans ses bornes', () => {
	assert.equal(enhancePlan(measure(-29)).pre_gain_db, 9)
	assert.equal(enhancePlan(measure(-10.9)).pre_gain_db, -9.1)
	assert.equal(enhancePlan(measure(-49)).pre_gain_db, 24)
})

test('la compression suit les écarts de volume', () => {
	assert.equal(enhancePlan(measure(-20, 5)).compressor.ratio, 1.5)
	assert.equal(enhancePlan(measure(-20, 11)).compressor.ratio, 2)
	assert.equal(enhancePlan(measure(-20, 18)).compressor.ratio, 2.5)
})

test('un son étouffé est signalé et proposé, même à bon volume', () => {
	const d = diagnose(measure(-17.6, 7.4, -6, -13.6))
	assert.deepEqual(d.issues.map((i) => i.kind), ['muffled'])
	assert.equal(d.recommended, true)
	assert.equal(diagnose(measure(-17, 8, -3, -10.5)).recommended, false)
})

test('l’égalisation se dose sur l’équilibre aigu / grave, sans dépasser le dosage calibré', () => {
	const muffled = (tilt_db) => ({ tilt_db, air_db: -26 })
	assert.equal(eqAmount(muffled(-8)), 0)
	assert.equal(eqAmount(muffled(-10)), 0)
	assert.equal(eqAmount(muffled(-11.5)), 0.5)
	assert.equal(eqAmount(muffled(-13.5)), 1)
	assert.equal(eqAmount(muffled(-14.4)), 1)
	assert.equal(eqAmount(muffled(-25)), 1)
	assert.equal(eqAmount(muffled(null)), 0)
	assert.deepEqual(enhancePlan(measure(-20, 8, -3, -9)).eq, [])
	assert.deepEqual(
		enhancePlan(measure(-29, 8, -13, -14.5)).eq.map((b) => [b.type, b.freq_hz, b.gain_db]),
		[['peak', 90, 2], ['peak', 280, -4], ['peak', 3000, 3], ['highshelf', 7000, 3]]
	)
})

test('un mix aux aigus présents n’est ni étouffé ni égalisé, même à présence creuse', () => {
	// Shower of seeds : groupe masterisé, fort, cymbales brillantes
	const shower = measure(-9.8, 14.1, 0.3, -12.4, -16.7)
	const d = diagnose(shower)
	assert.deepEqual(d.issues.map((i) => i.kind), ['loud', 'dynamics', 'saturated'])
	assert.deepEqual(proposedSettings(shower), { eq: 'none', compression: true })
	assert.deepEqual(enhancePlan(shower).eq, [])
	assert.equal(enhancePlan(shower).compressor.ratio, 2.5)
	assert.equal(eqAmount({ tilt_db: -12.4, air_db: null }), 0)
})

test('la proposition se ramène au palier le plus proche, et l’oreille peut la changer', () => {
	assert.equal(proposedSettings(measure(-17, 8, -3, -14.4)).eq, 'full')
	assert.equal(proposedSettings(measure(-17, 8, -3, -11.5)).eq, 'soft')
	assert.equal(proposedSettings(measure(-17, 8, -3, -9)).eq, 'none')
	const a = measure(-17, 8, -3, -14.4)
	assert.deepEqual(enhancePlan(a, { eq: 'soft', compression: true }).eq.map((b) => b.gain_db), [1, -2, 1.5, 1.5])
	assert.deepEqual(enhancePlan(a, { eq: 'none', compression: false }).eq, [])
	assert.equal(enhancePlan(a, { eq: 'full', compression: false }).compressor, null)
})

test('des réglages mal formés sont refusés', () => {
	assert.deepEqual(parseEnhanceSettings({ eq: 'soft', compression: false }), { eq: 'soft', compression: false })
	assert.equal(parseEnhanceSettings({ eq: 'max', compression: true }), null)
	assert.equal(parseEnhanceSettings({ eq: 'full', compression: 'oui' }), null)
	assert.equal(parseEnhanceSettings(null), null)
})

test('les niveaux s’écrivent à la française', () => {
	assert.equal(formatDb(-29.04, 'LUFS'), '−29 LUFS')
	assert.equal(formatDb(1.5, 'dB'), '+1,5 dB')
	assert.equal(formatDb(0, 'dB'), '0 dB')
})
