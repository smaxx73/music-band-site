import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ListenMeter, listenThreshold } from '../src/lib/listen-meter.ts'

/** Lecture continue de `from` à `to`, au rythme de `timeupdate` (4 par seconde). */
function play(meter, from, to, duration) {
	let counted = 0
	for (let t = from; t <= to + 1e-9; t += 0.25) if (meter.advance(t, duration)) counted += 1
	return counted
}

test('le seuil est de 30 s, ou la moitié d\'une prise courte', () => {
	assert.equal(listenThreshold(240), 30)
	assert.equal(listenThreshold(40), 20)
	assert.equal(listenThreshold(null), 30)
	assert.equal(listenThreshold(0), 30)
})

test('30 s lues font une écoute, une seule fois', () => {
	const meter = new ListenMeter()
	assert.equal(play(meter, 0, 29, 240), 0)
	assert.equal(play(meter, 29.25, 120, 240), 1)
})

test('un déplacement dans le morceau ne compte pas comme du temps écouté', () => {
	const meter = new ListenMeter()
	play(meter, 0, 10, 240)
	// Saut à 3:00 : l'écart n'est pas écouté.
	assert.equal(play(meter, 180, 195, 240), 0)
	assert.equal(play(meter, 195.25, 200, 240), 1)
})

test('une pause ne compte pas l\'écart avec la reprise', () => {
	const meter = new ListenMeter()
	play(meter, 0, 20, 240)
	meter.pause()
	assert.equal(play(meter, 21, 29, 240), 0)
	assert.equal(play(meter, 29.25, 32, 240), 1)
})

test('après une remise à zéro, une nouvelle lecture refait une écoute', () => {
	const meter = new ListenMeter()
	assert.equal(play(meter, 0, 40, 240), 1)
	meter.reset()
	assert.equal(play(meter, 0, 40, 240), 1)
})
