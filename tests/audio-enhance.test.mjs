import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
	autoDenoiseFloor,
	diagnose,
	enhancePlan,
	eqAmount,
	expertValues,
	formatDb,
	formatLevel,
	hasExpertSettings,
	noiseMeasurable,
	normalizeSettings,
	parseEnhanceSettings,
	parseSettingsKey,
	proposedSettings,
	sameSettings,
	settingsKey
} from '../src/lib/audio-enhance.ts'

const measure = (integrated_lufs, lra_lu = 8, true_peak_dbtp = -3, tilt_db = -9, air_db = -26, bass_db = -8) =>
	({ integrated_lufs, lra_lu, true_peak_dbtp, tilt_db, air_db, bass_db, source_bytes: 1 })

test('un son faible ou très fort est signalé, un son correct ne l’est pas', () => {
	assert.deepEqual(diagnose(measure(-29)).issues.map((i) => i.kind), ['quiet'])
	assert.deepEqual(diagnose(measure(-9)).issues.map((i) => i.kind), ['loud'])
	assert.equal(diagnose(measure(-15)).recommended, false)
	assert.equal(diagnose(measure(-15)).enhanceable, true)
	assert.equal(diagnose(measure(-19)).recommended, false)
	assert.deepEqual(diagnose(measure(-21)).issues.map((i) => i.kind), ['quiet'])
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
	const full = enhancePlan(measure(-29, 8, -13, -14.5))
	assert.deepEqual(full.eq.map((b) => [b.type, b.freq_hz, b.gain_db]), [['peak', 280, -4], ['peak', 3000, 3], ['highshelf', 7000, 3]])
	// Le renfort du grave accompagne l'égalisation proposée, comme au calibrage
	assert.deepEqual(full.bass_boost, { type: 'peak', freq_hz: 90, q: 0.9, gain_db: 2 })
})

test('un mix aux aigus présents n’est ni étouffé ni égalisé, même à présence creuse', () => {
	// Shower of seeds : groupe masterisé, fort, cymbales brillantes
	const shower = measure(-9.8, 14.1, 0.3, -12.4, -16.7)
	const d = diagnose(shower)
	assert.deepEqual(d.issues.map((i) => i.kind), ['loud', 'dynamics', 'saturated'])
	assert.deepEqual(proposedSettings(shower), { eq: 'none', bass: 'none', compression: true })
	assert.deepEqual(enhancePlan(shower).eq, [])
	assert.equal(enhancePlan(shower).compressor.ratio, 2.5)
	assert.equal(eqAmount({ tilt_db: -12.4, air_db: null }), 0)
})

test('la proposition se ramène au palier le plus proche, et l’oreille peut la changer', () => {
	assert.equal(proposedSettings(measure(-17, 8, -3, -14.4)).eq, 'full')
	assert.equal(proposedSettings(measure(-17, 8, -3, -11.5)).eq, 'soft')
	assert.equal(proposedSettings(measure(-17, 8, -3, -9)).eq, 'none')
	const a = measure(-17, 8, -3, -14.4)
	assert.deepEqual(enhancePlan(a, { eq: 'soft', bass: 'none', compression: true }).eq.map((b) => b.gain_db), [-2, 1.5, 1.5])
	assert.deepEqual(enhancePlan(a, { eq: 'none', bass: 'none', compression: false }).eq, [])
	assert.equal(enhancePlan(a, { eq: 'full', bass: 'none', compression: false }).compressor, null)
	// Le grave se règle indépendamment de l'égalisation
	const bodyOnly = enhancePlan(a, { eq: 'none', bass: 'boost', compression: true })
	assert.deepEqual(bodyOnly.eq, [])
	assert.equal(bodyOnly.bass_boost.gain_db, 2)
	assert.equal(bodyOnly.bass_cut, null)
})

test('des réglages mal formés sont refusés', () => {
	assert.deepEqual(
		parseEnhanceSettings({ eq: 'soft', bass: 'cut', compression: false }),
		{ eq: 'soft', bass: 'cut', compression: false }
	)
	// Réglages gardés avant le choix du grave : le renfort faisait partie de l'égalisation
	assert.deepEqual(parseEnhanceSettings({ eq: 'full', compression: true }), { eq: 'full', bass: 'boost', compression: true })
	assert.deepEqual(parseEnhanceSettings({ eq: 'none', compression: true }), { eq: 'none', bass: 'none', compression: true })
	assert.equal(parseEnhanceSettings({ eq: 'full', bass: 'max', compression: true }), null)
	assert.equal(parseEnhanceSettings({ eq: 'max', compression: true }), null)
	assert.equal(parseEnhanceSettings({ eq: 'full', compression: 'oui' }), null)
	assert.equal(parseEnhanceSettings(null), null)
})

test('un grave qui couvre le reste est détecté, et allégé après la compression', () => {
	// Shower of seeds : grave −2,2 dB face au bas-médium
	const shower = measure(-9.8, 14.1, 0.3, -12.4, -16.7, -2.2)
	assert.ok(diagnose(shower).issues.some((i) => i.kind === 'boomy'))
	assert.equal(proposedSettings(shower).bass, 'cut')
	const plan = enhancePlan(shower)
	assert.deepEqual(plan.bass_cut, { type: 'lowshelf', freq_hz: 100, q: 0.7, gain_db: -2.5 })
	assert.equal(plan.bass_boost, null)
	// Les prises piano–voix (−9,2 et −7,2), étouffées : grave renforcé, comme au calibrage
	assert.equal(proposedSettings(measure(-28.9, 8.1, -13.2, -14.4, -26.9, -9.2)).bass, 'boost')
	assert.equal(proposedSettings(measure(-17.6, 7.4, -6.2, -13.5, -25, -7.2)).bass, 'boost')
	// Ni étouffée ni chargée en grave : tel quel
	assert.equal(proposedSettings(measure(-15, 8, -3, -9, -18, -7)).bass, 'none')
})

test('les niveaux s’écrivent à la française', () => {
	assert.equal(formatDb(-29.04, 'LUFS'), '−29 LUFS')
	assert.equal(formatDb(1.5, 'dB'), '+1,5 dB')
	assert.equal(formatDb(0, 'dB'), '0 dB')
	assert.equal(formatLevel(14.06, 'LU'), '14,1 LU')
})

test('la clé d’un réglage nomme son aperçu et se relit à l’identique', () => {
	for (const eq of ['none', 'soft', 'full']) {
		for (const bass of ['cut', 'none', 'boost']) {
			for (const compression of [true, false]) {
				const settings = { eq, bass, compression }
				assert.deepEqual(parseSettingsKey(settingsKey(settings)), settings)
			}
		}
	}
	assert.equal(settingsKey({ eq: 'full', bass: 'boost', compression: true }), 'full-boost-comp')
	for (const bad of [null, '', 'full', 'full-boost', 'full-boost-yes', 'loud-boost-comp', 'full-boost-comp-x', '../x-boost-comp']) {
		assert.equal(parseSettingsKey(bad), null, String(bad))
	}
})

// --- Mode expert ---

test('sans réglage expert, la chaîne est celle des paliers', () => {
	const a = measure(-29, 8, -13, -14.5)
	const plan = enhancePlan(a, { eq: 'full', bass: 'boost', compression: true })
	assert.equal(plan.denoise, null)
	assert.equal(plan.highpass_hz, 35)
	assert.deepEqual(plan.compressor, { threshold_db: -24, ratio: 1.5, attack_ms: 15, release_ms: 200 })
	assert.equal(plan.target_lufs, -14)
	assert.equal(plan.limit_db, -1.5)
})

test('un réglage expert remplace la valeur du palier, et lui seul', () => {
	const a = measure(-29, 8, -13, -14.5)
	const plan = enhancePlan(a, {
		eq: 'full', bass: 'boost', compression: true,
		expert: { presence_db: 1.5, bass_db: -4, ratio: 3, highpass_hz: 0, target_lufs: -16, denoise_db: 12, denoise_floor_db: -45 }
	})
	assert.deepEqual(plan.eq.map((b) => [b.freq_hz, b.gain_db]), [[280, -4], [3000, 1.5], [7000, 3]])
	// Grave négatif : coupe après le compresseur, plus de renfort
	assert.equal(plan.bass_boost, null)
	assert.deepEqual(plan.bass_cut, { type: 'lowshelf', freq_hz: 100, q: 0.7, gain_db: -4 })
	assert.deepEqual(plan.compressor, { threshold_db: -24, ratio: 3, attack_ms: 15, release_ms: 200 })
	assert.equal(plan.highpass_hz, null)
	assert.equal(plan.target_lufs, -16)
	assert.deepEqual(plan.denoise, { reduction_db: 12, floor_db: -45, track: false })
	// Une bande ramenée à zéro disparaît de la chaîne
	const flat = enhancePlan(a, { eq: 'full', bass: 'none', compression: false, expert: { mud_db: 0, presence_db: 0, air_db: 0 } })
	assert.deepEqual(flat.eq, [])
})

test('les réglages experts se ramènent à leur forme la plus courte', () => {
	// Une valeur qui vaut celle du palier n'est pas un réglage
	assert.deepEqual(
		normalizeSettings({ eq: 'full', bass: 'cut', compression: true, expert: { mud_db: -4, bass_db: -2.5, highpass_hz: 35, target_lufs: -14 } }),
		{ eq: 'full', bass: 'cut', compression: true }
	)
	// Seuil et suivi d'un débruitage coupé, réglages d'une compression coupée : sans objet
	assert.deepEqual(
		normalizeSettings({ eq: 'none', bass: 'none', compression: false, expert: { denoise_db: 0, denoise_floor_db: -40, denoise_track: true, ratio: 3, air_db: 2 } }),
		{ eq: 'none', bass: 'none', compression: false, expert: { air_db: 2 } }
	)
	assert.equal(hasExpertSettings({ eq: 'none', bass: 'none', compression: true }), false)
	assert.equal(hasExpertSettings({ eq: 'none', bass: 'none', compression: true, expert: { denoise_db: 6 } }), true)
})

test('des réglages experts hors bornes ou inconnus sont refusés', () => {
	const base = { eq: 'soft', bass: 'none', compression: true }
	assert.deepEqual(
		parseEnhanceSettings({ ...base, expert: { denoise_db: 12, denoise_track: true, presence_db: 2.26 } }),
		{ ...base, expert: { denoise_db: 12, presence_db: 2.5, denoise_track: true } }
	)
	for (const expert of [{ denoise_db: 40 }, { ratio: 1 }, { limit_db: 0 }, { foo: 1 }, { ratio: '2' }, { air_db: NaN }, { denoise_track: 1 }, [], 'x']) {
		assert.equal(parseEnhanceSettings({ ...base, expert }), null, JSON.stringify(expert))
	}
})

test('la clé d’un réglage expert se relit à l’identique, sous sa seule forme canonique', () => {
	const settings = {
		eq: 'soft', bass: 'none', compression: true,
		expert: { denoise_db: 12, denoise_floor_db: -52, presence_db: 2.5, bass_db: -1.5, ratio: 3.2, limit_db: -0.5, denoise_track: true }
	}
	const key = settingsKey(settings)
	assert.equal(key, 'soft-none-comp~dn12~df-52~pr2.5~ba-1.5~ra3.2~li-0.5~dt')
	assert.deepEqual(parseSettingsKey(key), settings)
	assert.equal(sameSettings(settings, { ...settings, expert: { ...settings.expert, mud_db: -2 } }), true)
	assert.equal(sameSettings(settings, { ...settings, expert: { ...settings.expert, ratio: 3 } }), false)
	for (const bad of ['soft-none-comp~', 'soft-none-comp~dn', 'soft-none-comp~dn99', 'soft-none-comp~zz1', 'soft-none-comp~dn12~dn12', 'soft-none-comp~pr2.55', 'soft-none-comp~pr1e1', 'soft-none-comp~mu-2', 'soft-none-comp~dt', 'soft-none-comp~dn12/..']) {
		assert.equal(parseSettingsKey(bad), null, bad)
	}
})

test('le seuil du débruiteur se cale sur le bruit mesuré, sans jamais mordre sur la musique', () => {
	const profile = (quiet_db, loud_db) => ({ freqs_hz: [], mean_db: [], noise_db: [], levels: [], levels_from_db: -70, quiet_db, loud_db })
	// Téléphone avec des respirations : 5 dB au-dessus du bruit
	assert.equal(noiseMeasurable(profile(-59, -22)), true)
	assert.equal(autoDenoiseFloor(profile(-59, -22)), -54)
	// Bruit plus proche de la musique : jamais à moins de 30 dB des passages forts
	assert.equal(autoDenoiseFloor(profile(-47, -20)), -50)
	// Groupe qui joue sans pause : les passages calmes sont de la musique
	assert.equal(noiseMeasurable(profile(-17, -11)), false)
	assert.equal(autoDenoiseFloor(profile(-17, -11)), -41)
	assert.equal(autoDenoiseFloor(undefined), -50)
	const a = { ...measure(-26), profile: profile(-59, -22) }
	assert.equal(expertValues(a, { eq: 'none', bass: 'none', compression: true }).denoise_floor_db, -54)
	assert.equal(enhancePlan(a, { eq: 'none', bass: 'none', compression: true, expert: { denoise_db: 6 } }).denoise.floor_db, -54)
})
