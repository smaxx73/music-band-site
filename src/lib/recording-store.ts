/**
 * Copie de secours d'un enregistrement fait dans le navigateur, dans IndexedDB.
 *
 * Une répétition s'enregistre sur une heure ou deux : un onglet qui plante, un
 * téléphone qui s'éteint ou un envoi qui échoue ne doivent pas tout emporter. Chaque
 * bloc livré par `MediaRecorder` est écrit ici au fil de l'eau, et l'enregistrement
 * n'est effacé qu'une fois la prise créée sur le serveur. Plusieurs peuvent attendre
 * ensemble : une série de prises enregistrées d'affilée, envoyée à la fin.
 *
 * Tout est « au mieux » : navigation privée, quota plein ou Safari capricieux peuvent
 * refuser l'écriture. L'enregistrement continue alors en mémoire seule, et
 * l'appelant le dit à l'écran.
 */

import type { AudioTrim } from '$lib/types'

const DB_NAME = 'band-recorder'
const DB_VERSION = 1

export type StoredTake = {
	id: number
	mimeType: string
	startedAt: number
	/** Durée d'enregistrement effective (hors pauses), mise à jour à chaque bloc. */
	durationS: number
	sizeBytes: number
}

/** Une prise terminée que l'enregistreur confie à la série, sans l'envoyer. */
export type RecordedTake = {
	id: number
	file: File
	durationS: number
	/** Bornes choisies à l'écoute ; null garde tout l'audio. */
	trim: AudioTrim | null
}

type StoredChunk = { takeId: number; seq: number; data: Blob }

// Les blocs, l'annulation et le démarrage suivant doivent toucher IndexedDB dans cet
// ordre. Sinon une écriture encore en attente peut recréer une prise déjà effacée.
let mutations: Promise<void> = Promise.resolve()

function enqueueMutation(action: () => Promise<void>): Promise<void> {
	const pending = mutations.then(action)
	mutations = pending.catch(() => {})
	return pending
}

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		if (typeof indexedDB === 'undefined') {
			reject(new Error('IndexedDB indisponible'))
			return
		}
		const req = indexedDB.open(DB_NAME, DB_VERSION)
		req.onupgradeneeded = () => {
			const db = req.result
			db.createObjectStore('takes', { keyPath: 'id' })
			db.createObjectStore('chunks', { keyPath: ['takeId', 'seq'] })
		}
		req.onsuccess = () => resolve(req.result)
		req.onerror = () => reject(req.error)
	})
}

function done(tx: IDBTransaction): Promise<void> {
	return new Promise((resolve, reject) => {
		tx.oncomplete = () => resolve()
		tx.onerror = () => reject(tx.error)
		tx.onabort = () => reject(tx.error)
	})
}

function chunkRange(takeId: number): IDBKeyRange {
	return IDBKeyRange.bound([takeId, 0], [takeId, Number.MAX_SAFE_INTEGER])
}

export function beginTake(take: StoredTake): Promise<void> {
	return enqueueMutation(() => writeTake(take))
}

async function writeTake(take: StoredTake): Promise<void> {
	const db = await openDb()
	const tx = db.transaction('takes', 'readwrite')
	tx.objectStore('takes').put(take)
	try {
		await done(tx)
	} finally {
		db.close()
	}
}

export function appendChunk(take: StoredTake, seq: number, data: Blob): Promise<void> {
	return enqueueMutation(() => writeChunk(take, seq, data))
}

async function writeChunk(take: StoredTake, seq: number, data: Blob): Promise<void> {
	const db = await openDb()
	// Bloc et métadonnées dans la même transaction : la durée annoncée à la reprise
	// correspond toujours aux blocs réellement présents.
	const tx = db.transaction(['takes', 'chunks'], 'readwrite')
	tx.objectStore('chunks').put({ takeId: take.id, seq, data } satisfies StoredChunk)
	tx.objectStore('takes').put(take)
	try {
		await done(tx)
	} finally {
		db.close()
	}
}

/**
 * Les enregistrements restés en attente, du plus ancien au plus récent. Une série de
 * prises enregistrées d'affilée en laisse plusieurs : chacune attend son envoi.
 */
export async function findPendingTakes(): Promise<StoredTake[]> {
	await mutations
	const db = await openDb()
	const tx = db.transaction('takes', 'readonly')
	const req = tx.objectStore('takes').getAll()
	try {
		await done(tx)
	} finally {
		db.close()
	}
	const takes = (req.result as StoredTake[]).filter((t) => t.sizeBytes > 0)
	return takes.sort((a, b) => a.startedAt - b.startedAt)
}

/** Recolle les blocs dans l'ordre : concaténés, ils forment un fichier WebM/MP4 valide. */
export async function assembleTake(take: StoredTake): Promise<Blob> {
	await mutations
	const db = await openDb()
	const tx = db.transaction('chunks', 'readonly')
	const req = tx.objectStore('chunks').getAll(chunkRange(take.id))
	try {
		await done(tx)
	} finally {
		db.close()
	}
	const chunks = (req.result as StoredChunk[]).sort((a, b) => a.seq - b.seq)
	return new Blob(
		chunks.map((c) => c.data),
		{ type: take.mimeType }
	)
}

/** Efface tous les enregistrements conservés. */
export function clearTakes(): Promise<void> {
	return enqueueMutation(clearStoredTakes)
}

async function clearStoredTakes(): Promise<void> {
	const db = await openDb()
	const tx = db.transaction(['takes', 'chunks'], 'readwrite')
	tx.objectStore('takes').clear()
	tx.objectStore('chunks').clear()
	try {
		await done(tx)
	} finally {
		db.close()
	}
}

/**
 * Efface les seuls enregistrements désignés : envoyés, ou jetés. Les autres prises d'une
 * série attendent encore le leur, et doivent survivre à un plantage d'ici là.
 */
export function deleteTakes(ids: number[]): Promise<void> {
	if (!ids.length) return Promise.resolve()
	return enqueueMutation(() => deleteStoredTakes(ids))
}

async function deleteStoredTakes(ids: number[]): Promise<void> {
	const db = await openDb()
	const tx = db.transaction(['takes', 'chunks'], 'readwrite')
	for (const id of ids) {
		tx.objectStore('takes').delete(id)
		tx.objectStore('chunks').delete(chunkRange(id))
	}
	try {
		await done(tx)
	} finally {
		db.close()
	}
}

/**
 * L'identifiant de copie de secours d'un fichier issu de l'enregistreur : le fichier est
 * daté du début de la captation, qui sert aussi de clé à la prise conservée.
 */
export function takeIdOf(file: File): number {
	return file.lastModified
}
