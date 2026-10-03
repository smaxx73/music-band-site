import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reconnectAudio } from '../src/lib/audio-reconnect.ts'

const browser = new EventTarget()
const page = new EventTarget()
Object.defineProperty(page, 'visibilityState', { value: 'visible' })
Object.defineProperty(globalThis, 'window', { value: browser, configurable: true })
Object.defineProperty(globalThis, 'document', { value: page, configurable: true })
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true })

class FakeAudio extends EventTarget {
	src = '/audio/1.mp3'
	currentTime = 0
	readyState = 0
	ended = false
	error = null
	paused = true
	loads = 0
	plays = 0

	load() {
		this.loads++
		this.error = null
		this.currentTime = 0
		queueMicrotask(() => this.dispatchEvent(new Event('loadedmetadata')))
	}

	play() {
		this.plays++
		this.paused = false
		this.dispatchEvent(new Event('play'))
		this.dispatchEvent(new Event('playing'))
		return Promise.resolve()
	}

	pause() {
		this.paused = true
		this.dispatchEvent(new Event('pause'))
	}
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

test('reprend après une erreur réseau à la dernière position', async () => {
	const media = new FakeAudio()
	const recovery = reconnectAudio(media, { retryMs: 5, timeoutMs: 50 })
	media.play()
	media.currentTime = 42
	media.dispatchEvent(new Event('timeupdate'))
	media.error = new Error('network')
	media.currentTime = 0 // Un navigateur peut perdre la position après l'erreur.
	media.dispatchEvent(new Event('error'))
	await wait(20)
	assert.equal(media.loads, 1)
	assert.equal(media.plays, 2)
	assert.equal(media.currentTime, 42)
	recovery.destroy()
})

test('attend le retour du réseau et respecte une pause volontaire', async () => {
	const media = new FakeAudio()
	const recovery = reconnectAudio(media, { retryMs: 5, timeoutMs: 50 })
	media.play()
	navigator.onLine = false
	media.error = new Error('network')
	media.dispatchEvent(new Event('error'))
	await wait(10)
	assert.equal(media.loads, 0)
	navigator.onLine = true
	browser.dispatchEvent(new Event('online'))
	await wait(10)
	assert.equal(media.loads, 1)
	media.pause()
	await wait(5)
	media.error = new Error('network')
	media.dispatchEvent(new Event('error'))
	await wait(10)
	assert.equal(media.loads, 1)
	recovery.destroy()
})

test('relance un flux bloqué sans erreur et abandonne la reprise après un changement de piste', async () => {
	const media = new FakeAudio()
	const recovery = reconnectAudio(media, { retryMs: 5, stallMs: 5, timeoutMs: 50 })
	media.play()
	media.currentTime = 18
	media.dispatchEvent(new Event('timeupdate'))
	media.dispatchEvent(new Event('waiting'))
	await wait(20)
	assert.equal(media.loads, 1)
	assert.equal(media.currentTime, 18)

	media.error = new Error('network')
	media.dispatchEvent(new Event('error'))
	recovery.reset()
	media.src = '/audio/2.mp3'
	await wait(15)
	assert.equal(media.loads, 1)
	recovery.destroy()
})
