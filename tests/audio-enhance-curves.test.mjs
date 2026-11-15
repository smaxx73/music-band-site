import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bandGainDb, compressorOutDb, denoiseThresholdDb, highpassGainDb, planResponseDb } from '../src/lib/audio-enhance-curves.ts'
import { enhancePlan } from '../src/lib/audio-enhance.ts'
import { createProfiler } from '../src/lib/server/audio-profile.ts'

const near = (actual, expected, tolerance = 0.02) =>
	assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≠ ${expected} (±${tolerance})`)

// Valeurs mesurées en sortie de ffmpeg, sur des sinus : les courbes dessinées sont celles
// des filtres appliqués.
test('la courbe d’une bande d’égalisation est celle du filtre ffmpeg', () => {
	const mud = { type: 'peak', freq_hz: 280, q: 0.8, gain_db: -4 }
	near(bandGainDb(mud, 280), -4)
	near(bandGainDb(mud, 60), -0.3)
	near(bandGainDb(mud, 2000), -0.13)
	const air = { type: 'highshelf', freq_hz: 7000, q: 0.5, gain_db: 3 }
	near(bandGainDb(air, 7000), 1.5)
	near(bandGainDb(air, 2000), 0.2)
	const bass = { type: 'lowshelf', freq_hz: 100, q: 0.7, gain_db: -2.5 }
	near(bandGainDb(bass, 20), -2.49)
	near(bandGainDb(bass, 60), -2.2)
	near(bandGainDb(bass, 280), -0.05)
})

test('le coupe-bas coupe ce qu’il annonce', () => {
	near(highpassGainDb(35, 20), -10.16)
	near(highpassGainDb(35, 60), -0.48)
	near(highpassGainDb(120, 60), -12.31)
	near(highpassGainDb(35, 1000), 0)
})

test('la correction du timbre additionne les étages de la chaîne', () => {
	const a = { integrated_lufs: -29, lra_lu: 8, true_peak_dbtp: -13, tilt_db: -14.5, air_db: -26, bass_db: -8, source_bytes: 1 }
	const plan = enhancePlan(a, { eq: 'full', bass: 'boost', compression: true })
	near(planResponseDb(plan, 3000), 3 + bandGainDb(plan.eq[0], 3000) + bandGainDb(plan.eq[2], 3000) + bandGainDb(plan.bass_boost, 3000))
	// Sans égalisation ni coupe-bas : rien
	const flat = enhancePlan(a, { eq: 'none', bass: 'none', compression: true, expert: { highpass_hz: 0 } })
	assert.equal(planResponseDb(flat, 100), 0)
})

test('la courbe du compresseur : intacte sous le genou, pente 1/taux au-dessus', () => {
	const comp = { threshold_db: -24, ratio: 2, attack_ms: 15, release_ms: 200 }
	assert.equal(compressorOutDb(-40, comp), -40)
	near(compressorOutDb(-12, comp), -18)
	near(compressorOutDb(-6, comp), -15)
	// Dans le genou : entre les deux droites, sans rupture
	const knee = compressorOutDb(-24, comp)
	assert.ok(knee < -24 && knee > -25)
	for (let db = -60; db < 0; db++) assert.ok(compressorOutDb(db + 1, comp) > compressorOutDb(db, comp))
})

test('le seuil du débruiteur monte de 3 dB par octave, comme un bruit blanc', () => {
	near(denoiseThresholdDb(-50, 2000) - denoiseThresholdDb(-50, 1000), 3.01)
	near(denoiseThresholdDb(-40, 1000) - denoiseThresholdDb(-50, 1000), 10)
})

// --- Profil d'un fichier ---

const SAMPLE_RATE = 44100
const sumDb = (levels) => 10 * Math.log10(levels.reduce((sum, db) => sum + 10 ** (db / 10), 0))

function profileOf(samples, chunk = 5000) {
	const profiler = createProfiler(SAMPLE_RATE)
	for (let i = 0; i < samples.length; i += chunk) profiler.push(samples.subarray(i, i + chunk))
	return profiler.finish()
}

test('le profil d’un sinus le place dans sa bande, à son niveau', () => {
	const samples = new Float32Array(SAMPLE_RATE * 4)
	for (let i = 0; i < samples.length; i++) samples[i] = Math.SQRT2 * 0.1 * Math.sin((2 * Math.PI * 1000 * i) / SAMPLE_RATE)
	const profile = profileOf(samples)
	assert.equal(profile.freqs_hz.length, 31)
	assert.equal(profile.freqs_hz[17], 1000)
	near(profile.mean_db[17], -20, 0.1)
	near(sumDb(profile.mean_db), -20, 0.1)
	assert.equal(profile.loud_db, -20)
	near(profile.levels.reduce((sum, share) => sum + share, 0), 1, 0.001)
	// Le découpage en blocs ne change rien à la mesure
	assert.deepEqual(profileOf(samples, 777), profile)
})

test('le bruit de fond est le niveau des passages calmes, pas la moyenne', () => {
	// Bruit à −50 dB en continu, et une note à −17 dB deux secondes sur trois
	let seed = 1
	const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
	const samples = new Float32Array(SAMPLE_RATE * 15)
	for (let i = 0; i < samples.length; i++) {
		const t = i / SAMPLE_RATE
		const noise = (random() + random() + random() + random() - 2) * Math.sqrt(3) * 10 ** (-50 / 20)
		samples[i] = noise + (t % 3 < 2 ? 0.2 * Math.sin(2 * Math.PI * 440 * t) : 0)
	}
	const profile = profileOf(samples)
	near(profile.quiet_db, -50, 1)
	near(sumDb(profile.noise_db), -50, 1.5)
	near(profile.loud_db, -17, 1)
	// 440 Hz tombe dans le tiers d'octave centré sur 397 Hz
	assert.equal(profile.freqs_hz[13], 397)
	assert.ok(profile.mean_db[13] > -22, 'la bande de la note porte la note')
	assert.ok(profile.noise_db[13] < -60, 'et retombe au bruit entre deux notes')
})

test('un fichier muet ou trop court n’a pas de profil', () => {
	assert.equal(profileOf(new Float32Array(SAMPLE_RATE * 2)), null)
	assert.equal(profileOf(new Float32Array(1000).fill(0.1)), null)
})
