/**
 * Copie de secours d'un enregistrement fait dans le navigateur, dans IndexedDB.
 *
 * Une répétition s'enregistre sur une heure ou deux : un onglet qui plante, un
 * téléphone qui s'éteint ou un envoi qui échoue ne doivent pas tout emporter. Chaque
 * bloc livré par `MediaRecorder` est écrit ici au fil de l'eau, et l'enregistrement
 * n'est effacé qu'une fois la prise créée sur le serveur.
 *
 * Tout est « au mieux » : navigation privée, quota plein ou Safari capricieux peuvent
 * refuser l'écriture. L'enregistrement continue alors en mémoire seule, et
 * l'appelant le dit à l'écran.
 */

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

type StoredChunk = { takeId: number; seq: number; data: Blob }

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

export async function beginTake(take: StoredTake): Promise<void> {
	const db = await openDb()
	const tx = db.transaction('takes', 'readwrite')
	tx.objectStore('takes').put(take)
	await done(tx)
	db.close()
}

export async function appendChunk(take: StoredTake, seq: number, data: Blob): Promise<void> {
	const db = await openDb()
	// Bloc et métadonnées dans la même transaction : la durée annoncée à la reprise
	// correspond toujours aux blocs réellement présents.
	const tx = db.transaction(['takes', 'chunks'], 'readwrite')
	tx.objectStore('chunks').put({ takeId: take.id, seq, data } satisfies StoredChunk)
	tx.objectStore('takes').put(take)
	await done(tx)
	db.close()
}

/** L'enregistrement le plus récent resté en attente, s'il en existe un. */
export async function findPendingTake(): Promise<StoredTake | null> {
	const db = await openDb()
	const tx = db.transaction('takes', 'readonly')
	const req = tx.objectStore('takes').getAll()
	await done(tx)
	db.close()
	const takes = (req.result as StoredTake[]).filter((t) => t.sizeBytes > 0)
	takes.sort((a, b) => b.startedAt - a.startedAt)
	return takes[0] ?? null
}

/** Recolle les blocs dans l'ordre : concaténés, ils forment un fichier WebM/MP4 valide. */
export async function assembleTake(take: StoredTake): Promise<Blob> {
	const db = await openDb()
	const tx = db.transaction('chunks', 'readonly')
	const req = tx.objectStore('chunks').getAll(chunkRange(take.id))
	await done(tx)
	db.close()
	const chunks = (req.result as StoredChunk[]).sort((a, b) => a.seq - b.seq)
	return new Blob(
		chunks.map((c) => c.data),
		{ type: take.mimeType }
	)
}

/** Efface tous les enregistrements conservés : un seul est proposé à la reprise. */
export async function clearTakes(): Promise<void> {
	const db = await openDb()
	const tx = db.transaction(['takes', 'chunks'], 'readwrite')
	tx.objectStore('takes').clear()
	tx.objectStore('chunks').clear()
	await done(tx)
	db.close()
}
