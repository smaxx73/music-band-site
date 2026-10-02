<script lang="ts">
	import { onDestroy, onMount } from 'svelte'
	import Icon from './Icon.svelte'
	import ConfirmDialog from './ConfirmDialog.svelte'
	import type { AudioTrim } from '$lib/types'
	import {
		appendChunk,
		assembleTake,
		beginTake,
		clearTakes,
		findPendingTake,
		type StoredTake
	} from '$lib/recording-store'

	/**
	 * Enregistrement en direct depuis le navigateur : micro du PC, du téléphone ou
	 * interface audio. Le résultat est un `File` ordinaire, remis à la page d'upload qui
	 * l'envoie comme n'importe quel fichier (prise simple ou import à découper).
	 */
	let {
		disabled = false,
		onchange,
		ontrimchange,
		onbusychange
	}: {
		disabled?: boolean
		/** Enregistrement prêt à envoyer (et sa durée), ou `null` quand il est écarté. */
		onchange: (file: File | null, durationS: number) => void
		/** Bornes à appliquer au fichier lors de l'envoi ; null garde tout l'audio. */
		ontrimchange?: (trim: AudioTrim | null) => void
		/** Vrai tant qu'un enregistrement est en cours : la page ne doit pas démonter le composant. */
		onbusychange?: (busy: boolean) => void
	} = $props()

	// Aligné sur MAX_UPLOAD_SIZE (src/lib/server/upload-stream.ts) : au-delà, le serveur
	// refuserait le fichier. On s'arrête un peu avant, l'enveloppe multipart compte aussi.
	const MAX_BYTES = 195 * 1024 * 1024
	const WARN_BYTES = 170 * 1024 * 1024
	// Un bloc toutes les 5 s : c'est ce qu'on perd au pire si l'onglet plante.
	const TIMESLICE_MS = 5000
	// 128 kbit/s : le débit de stockage de l'application, et ~2 h sous la limite d'envoi.
	const BITRATE = 128_000
	// En deçà, il n'y a rien à perdre : annuler ne demande pas confirmation.
	const CONFIRM_CANCEL_ABOVE_S = 5
	const MIN_TRIM_S = 0.5

	type Phase = 'idle' | 'arming' | 'armed' | 'starting' | 'recording' | 'paused' | 'stopping' | 'cancelling' | 'done'
	let phase = $state<Phase>('idle')
	let error = $state<string | null>(null)
	let warning = $state<string | null>(null)

	let devices = $state<MediaDeviceInfo[]>([])
	let deviceId = $state('')

	let elapsedS = $state(0)
	let sizeBytes = $state(0)
	let level = $state(0) // crête lissée, 0..1
	let clipping = $state(false)

	let pending = $state<StoredTake | null>(null)
	let pendingLoaded = $state(false)
	let pendingBusy = $state(false)
	let backupOk = $state(true)
	let wakeLockOk = $state(true)

	let previewUrl = $state<string | null>(null)
	let resultFile = $state<File | null>(null)
	let trimDuration = $state(0)
	let trimStart = $state(0)
	let trimEnd = $state(0)
	let previewing = $state(false)
	// Position réellement lue, tracée sur la forme d'onde : c'est elle qui prouve qu'on
	// entend la sélection, et non le début du fichier.
	let playheadS = $state<number | null>(null)
	let revealing = $state(false)
	let previewRaf = 0
	let waveBars = $state<number[]>([])
	let audioEl = $state<HTMLAudioElement | null>(null)
	let timelineEl = $state<HTMLDivElement | null>(null)
	let dragging: 'start' | 'end' | null = null
	let wavePeaks: number[] = []
	const selectedDuration = $derived(Math.max(0, trimEnd - trimStart))
	const hasTrim = $derived(trimStart > 0.01 || trimEnd < trimDuration - 0.01)

	let stream: MediaStream | null = null
	let audioCtx: AudioContext | null = null
	let analyser: AnalyserNode | null = null
	let rafId = 0
	let recorder: MediaRecorder | null = null
	let chunks: Blob[] = []
	let take: StoredTake | null = null
	let seq = 0
	let segmentStartedAt = 0 // horodatage du dernier démarrage/reprise
	let elapsedBeforeSegment = 0
	let timerId: ReturnType<typeof setInterval> | null = null
	let clipUntil = 0
	let wakeLock: WakeLockSentinel | null = null
	let destroyed = false
	// Vrai entre la demande d'annulation et l'arrêt effectif du `MediaRecorder` : les
	// derniers blocs arrivent après `stop()` et n'ont plus à être gardés nulle part.
	let cancelling = false

	// Ce que la confirmation en cours abandonnerait : l'enregistrement qui tourne, ou
	// celui qui vient de se terminer.
	let confirming = $state<'recording' | 'result' | null>(null)

	const supported =
		typeof navigator !== 'undefined' &&
		!!navigator.mediaDevices?.getUserMedia &&
		typeof MediaRecorder !== 'undefined'

	const busy = $derived(phase === 'starting' || phase === 'recording' || phase === 'paused' || phase === 'stopping' || phase === 'cancelling')
	$effect(() => onbusychange?.(busy))

	onMount(async () => {
		try {
			pending = await findPendingTake()
		} catch {
			// Pas de stockage local : rien à reprendre, l'enregistrement marchera sans secours.
		} finally {
			pendingLoaded = true
		}
	})

	onDestroy(() => {
		destroyed = true
		if (recorder && recorder.state !== 'inactive') recorder.stop()
		releaseInput()
		stopTimer()
		releaseWakeLock()
		cancelAnimationFrame(previewRaf)
		if (previewUrl) URL.revokeObjectURL(previewUrl)
		if (typeof window !== 'undefined') window.removeEventListener('beforeunload', onBeforeUnload)
		if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility)
	})

	// ─── Entrée audio ──────────────────────────────────────────────────────

	/**
	 * Les traitements pensés pour la visio (annulation d'écho, réduction de bruit,
	 * gain automatique) écrasent la dynamique et coupent les notes tenues : sur de la
	 * musique, ils sont toujours à couper.
	 */
	function constraints(id: string): MediaStreamConstraints {
		return {
			audio: {
				deviceId: id ? { exact: id } : undefined,
				echoCancellation: false,
				noiseSuppression: false,
				autoGainControl: false,
				channelCount: { ideal: 2 }
			}
		}
	}

	async function arm(id = deviceId) {
		error = null
		phase = 'arming'
		releaseInput()
		try {
			stream = await navigator.mediaDevices.getUserMedia(constraints(id))
		} catch (err) {
			if (destroyed) return
			phase = 'idle'
			const name = err instanceof DOMException ? err.name : ''
			error =
				name === 'NotAllowedError'
					? "Accès au micro refusé. Autorise-le dans les réglages du navigateur (icône à gauche de l'adresse), puis réessaie."
					: name === 'NotFoundError' || name === 'OverconstrainedError'
						? 'Aucune entrée audio trouvée. Branche un micro ou choisis une autre entrée.'
						: "Impossible d'ouvrir l'entrée audio."
			return
		}
		if (destroyed) {
			releaseInput()
			return
		}

		// Une erreur d'énumération ne doit pas bloquer le micro déjà ouvert.
		let all: MediaDeviceInfo[] = []
		try {
			all = await navigator.mediaDevices.enumerateDevices()
		} catch {
			// Le micro déjà autorisé suffit pour enregistrer.
		}
		if (destroyed) {
			releaseInput()
			return
		}
		if (!stream?.active) {
			phase = 'idle'
			error = "L'entrée audio n'est plus disponible. Réactive le micro."
			releaseInput()
			return
		}
		devices = all.filter((d) => d.kind === 'audioinput')
		deviceId = stream.getAudioTracks()[0]?.getSettings().deviceId ?? id

		stream.getAudioTracks()[0]?.addEventListener('ended', onInputLost)
		try {
			startMeter(stream)
		} catch {
			analyser = null
			audioCtx?.close().catch(() => {})
			audioCtx = null
			warning = "Le vumètre est indisponible, mais le micro peut enregistrer."
		}
		phase = 'armed'
	}

	function onInputLost() {
		if (phase === 'recording' || phase === 'paused') {
			error = "L'entrée audio a été débranchée : l'enregistrement s'est arrêté, ce qui a été capté est conservé."
			stop()
		} else if (phase === 'starting') {
			error = "L'entrée audio a été débranchée avant le début de l'enregistrement."
			phase = 'idle'
			releaseInput()
		} else {
			phase = 'idle'
			releaseInput()
		}
	}

	function releaseInput() {
		cancelAnimationFrame(rafId)
		stream?.getTracks().forEach((t) => t.stop())
		stream = null
		analyser = null
		audioCtx?.close().catch(() => {})
		audioCtx = null
		level = 0
		clipping = false
	}

	// ─── Vumètre ──────────────────────────────────────────────────────────

	function startMeter(s: MediaStream) {
		audioCtx = new AudioContext()
		// iOS crée le contexte suspendu même dans un geste utilisateur.
		audioCtx.resume().catch(() => {})
		analyser = audioCtx.createAnalyser()
		analyser.fftSize = 2048
		audioCtx.createMediaStreamSource(s).connect(analyser)
		const buf = new Float32Array(analyser.fftSize)

		const tick = () => {
			if (!analyser) return
			analyser.getFloatTimeDomainData(buf)
			let peak = 0
			for (let i = 0; i < buf.length; i++) {
				const v = Math.abs(buf[i])
				if (v > peak) peak = v
			}
			// Montée immédiate, descente lente : une crête doit rester lisible.
			level = peak > level ? peak : level * 0.92
			const now = performance.now()
			if (peak >= 0.98) clipUntil = now + 1500
			clipping = now < clipUntil
			if (phase === 'recording') {
				const bucket = Math.floor(currentElapsed() * 10)
				wavePeaks[bucket] = Math.max(wavePeaks[bucket] ?? 0, peak)
			}
			rafId = requestAnimationFrame(tick)
		}
		rafId = requestAnimationFrame(tick)
	}

	/** Position de la crête sur une échelle de −60 à 0 dBFS : c'est ce que l'oreille lit. */
	function meterPercent(peak: number): number {
		if (peak <= 0) return 0
		const db = 20 * Math.log10(peak)
		return Math.max(0, Math.min(100, ((db + 60) / 60) * 100))
	}

	// ─── Enregistrement ───────────────────────────────────────────────────

	/** Le premier format que le navigateur sait produire : WebM/Opus partout, MP4/AAC sur Safari. */
	function pickMimeType(): string {
		const candidates = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus']
		return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? ''
	}

	async function start() {
		if (!stream || phase !== 'armed' || pending) return
		phase = 'starting'
		error = null
		warning = null
		discardResult()

		const mimeType = pickMimeType()
		backupOk = true
		try {
			await clearTakes()
		} catch {
			backupOk = false
		}
		if (phase !== 'starting' || destroyed) return
		if (!stream?.active) {
			phase = 'idle'
			error = "L'entrée audio n'est plus disponible. Réactive le micro."
			releaseInput()
			return
		}
		try {
			const startedAt = Date.now()
			recorder = new MediaRecorder(stream, {
				...(mimeType ? { mimeType } : {}),
				audioBitsPerSecond: BITRATE
			})
			chunks = []
			wavePeaks = []
			seq = 0
			resetProgress()
			take = {
				id: startedAt,
				// Le type effectif, sans ses paramètres (`;codecs=opus`) : le serveur compare
				// le type exact à `audio_formats`.
				mimeType: baseMime(recorder.mimeType || mimeType || 'audio/webm'),
				startedAt,
				durationS: 0,
				sizeBytes: 0
			}

			if (backupOk) {
				try {
					await beginTake(take)
				} catch {
					backupOk = false
				}
			}
			if (phase !== 'starting' || destroyed || !stream?.active) {
				recorder = null
				take = null
				if (!destroyed && phase === 'starting') {
					phase = 'idle'
					error = "L'entrée audio n'est plus disponible. Réactive le micro."
					releaseInput()
				}
				return
			}

			recorder.ondataavailable = (e) => onChunk(e.data)
			recorder.onstop = onRecorderStop
			recorder.onerror = () => {
				error = "L'enregistrement s'est interrompu. Vérifie la prise avant de l'envoyer."
			}
			recorder.start(TIMESLICE_MS)
		} catch {
			recorder = null
			take = null
			phase = stream ? 'armed' : 'idle'
			error = "Impossible de démarrer l'enregistrement audio."
			clearTakes().catch(() => {})
			return
		}

		segmentStartedAt = performance.now()
		phase = 'recording'
		startTimer()
		acquireWakeLock()
		window.addEventListener('beforeunload', onBeforeUnload)
		document.addEventListener('visibilitychange', onVisibility)
	}

	function onChunk(data: Blob) {
		if (cancelling || !data.size || !take) return
		chunks.push(data)
		sizeBytes += data.size
		take = { ...take, sizeBytes, durationS: Math.round(currentElapsed()) }
		if (backupOk) {
			appendChunk(take, seq, data).catch(() => (backupOk = false))
		}
		seq++

		if (sizeBytes >= MAX_BYTES && recorder?.state !== 'inactive') {
			warning = 'Taille maximale atteinte (200 Mo) : l\'enregistrement s\'est arrêté.'
			stop()
		} else if (sizeBytes >= WARN_BYTES) {
			warning = "Bientôt la taille maximale d'envoi (200 Mo) : l'enregistrement s'arrêtera seul."
		}
	}

	function pause() {
		if (recorder?.state !== 'recording') return
		recorder.pause()
		elapsedBeforeSegment = currentElapsed()
		phase = 'paused'
	}

	function resume() {
		if (recorder?.state !== 'paused') return
		recorder.resume()
		segmentStartedAt = performance.now()
		phase = 'recording'
	}

	function stop() {
		if (!recorder || (phase !== 'recording' && phase !== 'paused')) return
		if (phase === 'recording') elapsedBeforeSegment = currentElapsed()
		// Le dernier bloc arrive par `dataavailable` juste avant `stop`.
		if (recorder.state !== 'inactive') recorder.stop()
		phase = 'stopping'
		stopTimer()
	}

	/**
	 * Annuler, c'est jeter ce qui a été capté et rendre le micro prêt à repartir — pas
	 * quitter l'écran. Ce qu'on vient d'enregistrer ne doit pas tenir à un clic de
	 * travers : au-delà de quelques secondes, la confirmation le nomme.
	 */
	function requestCancel(what: 'recording' | 'result') {
		if (elapsedS >= CONFIRM_CANCEL_ABOVE_S) confirming = what
		else if (what === 'recording') cancelRecording()
		else restart()
	}

	function cancelRecording() {
		confirming = null
		if (!recorder) {
			discardRecording()
			return
		}
		// Le dernier `dataavailable` arrive avant `onRecorderStop`, qui fera le ménage.
		cancelling = true
		if (recorder.state !== 'inactive') recorder.stop()
		stopTimer()
		resetProgress()
		phase = 'cancelling'
	}

	function resetProgress() {
		elapsedBeforeSegment = 0
		elapsedS = 0
		sizeBytes = 0
		warning = null
	}

	/** Remet l'enregistreur au point de départ, micro ouvert s'il l'est resté. */
	function discardRecording() {
		cancelling = false
		chunks = []
		take = null
		seq = 0
		resetProgress()
		phase = stream ? 'armed' : 'idle'
		clearTakes().catch(() => {})
		onchange(null, 0)
	}

	function onRecorderStop() {
		if ((phase === 'recording' || phase === 'paused') && !error) {
			error = "L'enregistrement s'est arrêté de façon inattendue. Vérifie la prise avant de l'envoyer."
		}
		if (phase === 'recording') elapsedBeforeSegment = currentElapsed()
		stopTimer()
		releaseWakeLock()
		window.removeEventListener('beforeunload', onBeforeUnload)
		document.removeEventListener('visibilitychange', onVisibility)
		if (cancelling) {
			discardRecording()
			return
		}
		elapsedS = elapsedBeforeSegment
		if (!take || chunks.length === 0) {
			phase = stream ? 'armed' : 'idle'
			if (!error) error = 'Aucun son n’a été enregistré. Réessaie.'
			return
		}
		setResult(new Blob(chunks, { type: take.mimeType }), take, elapsedBeforeSegment)
		chunks = []
	}

	function currentElapsed(): number {
		if (phase === 'recording') {
			return elapsedBeforeSegment + (performance.now() - segmentStartedAt) / 1000
		}
		return elapsedBeforeSegment
	}

	function startTimer() {
		stopTimer()
		timerId = setInterval(() => (elapsedS = currentElapsed()), 250)
	}

	function stopTimer() {
		if (timerId) clearInterval(timerId)
		timerId = null
	}

	// ─── Résultat ─────────────────────────────────────────────────────────

	function setResult(blob: Blob, t: StoredTake, durationS: number) {
		if (previewUrl) URL.revokeObjectURL(previewUrl)
		previewUrl = URL.createObjectURL(blob)
		// Daté du début de la captation, pas de sa relecture : une copie de secours
		// reprise le lendemain doit encore se classer dans la session de la veille.
		resultFile = new File([blob], fileName(t), { type: t.mimeType, lastModified: t.startedAt })
		trimDuration = durationS
		trimStart = 0
		trimEnd = durationS
		waveBars = makeWaveBars(wavePeaks)
		ontrimchange?.(null)
		sizeBytes = blob.size
		elapsedS = durationS
		phase = 'done'
		// Le micro n'a plus à rester ouvert : le voyant d'enregistrement du système s'éteint.
		releaseInput()
		onchange(resultFile, durationS)
	}

	function discardResult() {
		stopPreview()
		if (previewUrl) URL.revokeObjectURL(previewUrl)
		previewUrl = null
		resultFile = null
		ontrimchange?.(null)
		onchange(null, 0)
	}

	async function restart() {
		if (phase !== 'done') return
		confirming = null
		phase = 'arming'
		discardResult()
		resetProgress()
		await clearTakes().catch(() => {})
		await arm()
	}

	async function recoverPending() {
		if (!pending || pendingBusy) return
		pendingBusy = true
		try {
			const blob = await assembleTake(pending)
			if (!blob.size) throw new Error('vide')
			const t = pending
			pending = null
			setResult(blob, t, t.durationS)
		} catch {
			error = "L'enregistrement conservé n'a pas pu être relu."
		} finally {
			pendingBusy = false
		}
	}

	async function dropPending() {
		if (pendingBusy) return
		pendingBusy = true
		pending = null
		await clearTakes().catch(() => {})
		pendingBusy = false
	}

	function baseMime(type: string): string {
		return type.split(';')[0].trim().toLowerCase()
	}

	function fileName(t: StoredTake): string {
		const d = new Date(t.startedAt)
		const pad = (n: number) => String(n).padStart(2, '0')
		const ext = t.mimeType.includes('mp4') ? 'm4a' : t.mimeType.includes('ogg') ? 'ogg' : 'webm'
		return `enregistrement-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}h${pad(d.getMinutes())}.${ext}`
	}

	// ─── Écran allumé ─────────────────────────────────────────────────────

	// Sur téléphone, l'écran qui se verrouille coupe le micro : on le garde allumé.
	async function acquireWakeLock() {
		if (!('wakeLock' in navigator)) {
			wakeLockOk = false
			return
		}
		try {
			wakeLock = await navigator.wakeLock.request('screen')
			wakeLockOk = true
		} catch {
			wakeLockOk = false
		}
	}

	function releaseWakeLock() {
		wakeLock?.release().catch(() => {})
		wakeLock = null
	}

	// Le verrou tombe dès que l'onglet passe en arrière-plan : on le reprend au retour.
	function onVisibility() {
		if (document.visibilityState === 'visible' && busy) acquireWakeLock()
	}

	function onBeforeUnload(e: BeforeUnloadEvent) {
		e.preventDefault()
	}

	// ─── Affichage ────────────────────────────────────────────────────────

	function formatElapsed(s: number): string {
		const total = Math.floor(s)
		const h = Math.floor(total / 3600)
		const m = Math.floor((total % 3600) / 60)
		const sec = total % 60
		const mm = String(m).padStart(h ? 2 : 1, '0')
		return `${h ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`
	}

	function formatSize(bytes: number): string {
		return `${(bytes / 1024 / 1024).toFixed(1)} Mo`
	}

	function formatWhen(ts: number): string {
		return new Date(ts).toLocaleString('fr-FR', {
			day: 'numeric',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit'
		})
	}

	function makeWaveBars(peaks: number[]): number[] {
		if (!peaks.length) return []
		const count = 80
		return Array.from({ length: count }, (_, i) => {
			const from = Math.floor(i * peaks.length / count)
			const to = Math.max(from + 1, Math.ceil((i + 1) * peaks.length / count))
			let max = 0
			for (let j = from; j < to; j++) max = Math.max(max, peaks[j] ?? 0)
			return Math.max(6, Math.min(100, Math.sqrt(max) * 100))
		})
	}

	function formatTrimTime(seconds: number): string {
		const whole = Math.floor(seconds)
		return `${formatElapsed(whole)}.${Math.floor((seconds - whole) * 10)}`
	}

	function endPreview() {
		previewing = false
		cancelAnimationFrame(previewRaf)
		previewRaf = 0
		playheadS = null
	}

	function stopPreview() {
		endPreview()
		audioEl?.pause()
	}

	function emitTrim() {
		ontrimchange?.(hasTrim ? { startS: trimStart, endS: trimEnd } : null)
	}

	function setTrim(edge: 'start' | 'end', seconds: number) {
		if (disabled || trimDuration < MIN_TRIM_S) return
		const rounded = Math.round(seconds * 100) / 100
		if (edge === 'start') trimStart = Math.max(0, Math.min(rounded, trimEnd - MIN_TRIM_S))
		else trimEnd = Math.min(trimDuration, Math.max(rounded, trimStart + MIN_TRIM_S))
		stopPreview()
		emitTrim()
	}

	function resetTrim() {
		trimStart = 0
		trimEnd = trimDuration
		stopPreview()
		emitTrim()
	}

	function timeAtPointer(event: PointerEvent): number {
		if (!timelineEl || !trimDuration) return 0
		const rect = timelineEl.getBoundingClientRect()
		return Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * trimDuration
	}

	function startDrag(event: PointerEvent) {
		if (disabled || !timelineEl || trimDuration < MIN_TRIM_S) return
		const marked = event.target instanceof Element ? event.target.closest('[data-edge]')?.getAttribute('data-edge') : null
		const position = timeAtPointer(event)
		dragging = marked === 'start' || marked === 'end'
			? marked
			: Math.abs(position - trimStart) <= Math.abs(position - trimEnd) ? 'start' : 'end'
		timelineEl.setPointerCapture(event.pointerId)
		if (!marked) setTrim(dragging, position)
	}

	function moveDrag(event: PointerEvent) {
		if (dragging) setTrim(dragging, timeAtPointer(event))
	}

	function endDrag(event: PointerEvent) {
		if (!dragging) return
		dragging = null
		if (timelineEl?.hasPointerCapture(event.pointerId)) timelineEl.releasePointerCapture(event.pointerId)
	}

	function moveByKey(event: KeyboardEvent, edge: 'start' | 'end') {
		if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
		event.preventDefault()
		setTrim(edge, (edge === 'start' ? trimStart : trimEnd) + (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 1 : 0.1))
	}

	function applyAudioDuration() {
		const duration = audioEl?.duration
		if (!duration || !Number.isFinite(duration)) return
		const wasFull = !hasTrim
		trimDuration = duration
		trimEnd = wasFull ? duration : Math.min(trimEnd, duration)
		trimStart = Math.min(trimStart, Math.max(0, trimEnd - MIN_TRIM_S))
		emitTrim()
	}

	/**
	 * Un WebM de MediaRecorder (Chrome, Android) n'annonce ni durée ni index : le navigateur
	 * ignore alors une demande de position et rejoue depuis 0. L'envoyer au bout du fichier
	 * l'oblige à le parcourir une fois, après quoi la durée est connue et les positions
	 * atteignables.
	 */
	function revealDuration(el: HTMLAudioElement): Promise<void> {
		return new Promise((resolve) => {
			const done = () => {
				el.removeEventListener('durationchange', check)
				clearTimeout(timer)
				el.currentTime = 0
				resolve()
			}
			const check = () => { if (Number.isFinite(el.duration)) done() }
			const timer = setTimeout(done, 5000)
			el.addEventListener('durationchange', check)
			el.currentTime = 1e101
		})
	}

	async function onAudioMetadata() {
		if (audioEl && !previewing && !Number.isFinite(audioEl.duration)) {
			revealing = true
			await revealDuration(audioEl)
			revealing = false
		}
		applyAudioDuration()
	}

	/** Ne lance la lecture qu'une fois la position atteinte, pas seulement demandée. */
	function seekTo(el: HTMLAudioElement, seconds: number): Promise<void> {
		return new Promise((resolve) => {
			if (Math.abs(el.currentTime - seconds) < 0.01) return resolve()
			const done = () => {
				el.removeEventListener('seeked', done)
				clearTimeout(timer)
				resolve()
			}
			const timer = setTimeout(done, 3000)
			el.addEventListener('seeked', done)
			el.currentTime = seconds
		})
	}

	async function playSelection() {
		const el = audioEl
		if (!el) return
		if (previewing) { stopPreview(); return }
		previewing = true
		playheadS = trimStart
		// `play()` part dans le clic même : iOS refuse une lecture lancée après une attente,
		// et ne charge rien avant. Muette jusqu'à ce que le début de la sélection soit
		// atteint, pour ne jamais faire entendre autre chose que la sélection.
		el.muted = true
		try {
			await el.play()
			await seekTo(el, trimStart)
		} catch {
			el.muted = false
			endPreview()
			return
		}
		el.muted = false
		if (!previewing) { el.pause(); return }
		followPreview()
	}

	// `timeupdate` ne passe que toutes les ~250 ms : on déborderait d'autant après la fin
	// de la sélection. Suivi à chaque image, la coupure tombe là où le serveur coupera.
	function followPreview() {
		const el = audioEl
		if (!el || !previewing) return
		playheadS = el.currentTime
		if (el.currentTime >= trimEnd) { stopPreview(); return }
		previewRaf = requestAnimationFrame(followPreview)
	}
</script>

<div class="recorder">
	{#if !supported}
		<p class="message-error">
			Ce navigateur ne permet pas d'enregistrer. Utilise un navigateur récent (Chrome, Firefox,
			Safari 14.3+), sur une page en HTTPS.
		</p>
	{:else}
		{#if pending && phase !== 'recording' && phase !== 'paused'}
			<div class="pending">
				<p>
					Un enregistrement du <strong>{formatWhen(pending.startedAt)}</strong>
					({formatElapsed(pending.durationS)}, {formatSize(pending.sizeBytes)}) n'a pas été envoyé.
				</p>
				<div class="row">
					<button type="button" class="btn btn-secondary btn-sm" onclick={recoverPending} disabled={disabled || pendingBusy}>
						Récupérer
					</button>
					<button type="button" class="btn btn-ghost btn-sm" onclick={dropPending} disabled={disabled || pendingBusy}>
						Supprimer
					</button>
				</div>
			</div>
		{/if}

		{#if error}
			<p class="message-error">{error}</p>
		{/if}

		{#if phase === 'idle' || phase === 'arming'}
			<button
				type="button"
				class="btn btn-primary start-btn"
				onclick={() => arm()}
				disabled={disabled || phase === 'arming' || !pendingLoaded || !!pending}
			>
				<Icon name="mic" />
				{phase === 'arming' ? 'Ouverture du micro…' : 'Activer le micro'}
			</button>
			<p class="hint">
				Micro de l'appareil, casque ou interface audio branchée. Le son est capté tel quel,
				sans les corrections automatiques des appels vidéo.
			</p>
		{:else if phase === 'starting' || phase === 'stopping' || phase === 'cancelling'}
			<p class="hint" role="status">
				{phase === 'starting' ? 'Préparation de l’enregistrement…' : phase === 'stopping' ? 'Finalisation de l’enregistrement…' : 'Annulation de l’enregistrement…'}
			</p>
		{:else if phase === 'done'}
			<div class="result">
				<p class="summary">
					<Icon name="check" />
					Enregistrement prêt — {formatElapsed(elapsedS)} · {formatSize(sizeBytes)}
				</p>
				{#if previewUrl}
					<!-- Pas de contrôles natifs : leur ▶ rejouait tout le fichier, sélection ignorée,
					     sur une barre de progression sans rapport avec les poignées. -->
					<audio bind:this={audioEl} src={previewUrl} preload="metadata" onloadedmetadata={onAudioMetadata} onpause={endPreview} onended={endPreview}></audio>
					<div class="trim-editor">
						<div class="trim-heading">
							<strong>Recadrer l'audio</strong>
							<span>Glisse les poignées au doigt ou à la souris.</span>
						</div>
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="trim-timeline"
							bind:this={timelineEl}
							onpointerdown={startDrag}
							onpointermove={moveDrag}
							onpointerup={endDrag}
							onpointercancel={endDrag}
						>
							<div class="waveform" aria-hidden="true">
								{#if waveBars.length}
									{#each waveBars as bar}
										<span style:height={`${bar}%`}></span>
									{/each}
								{:else}
									<div class="waveform-fallback"></div>
								{/if}
							</div>
							<div class="trim-shade left" style:width={`${trimDuration ? trimStart / trimDuration * 100 : 0}%`}></div>
							<div class="trim-shade right" style:width={`${trimDuration ? (trimDuration - trimEnd) / trimDuration * 100 : 0}%`}></div>
							{#if playheadS !== null && trimDuration}
								<div class="trim-playhead" style:left={`${Math.min(100, playheadS / trimDuration * 100)}%`}></div>
							{/if}
							<button type="button" class="trim-handle" data-edge="start" style:left={`${trimDuration ? trimStart / trimDuration * 100 : 0}%`} aria-label={`Début de la sélection : ${formatTrimTime(trimStart)}`} title="Début de la sélection" onkeydown={(e) => moveByKey(e, 'start')} {disabled}></button>
							<button type="button" class="trim-handle" data-edge="end" style:left={`${trimDuration ? trimEnd / trimDuration * 100 : 100}%`} aria-label={`Fin de la sélection : ${formatTrimTime(trimEnd)}`} title="Fin de la sélection" onkeydown={(e) => moveByKey(e, 'end')} {disabled}></button>
						</div>
						<div class="trim-times">
							<span>Début <strong>{formatTrimTime(trimStart)}</strong></span>
							<span>{formatTrimTime(selectedDuration)} conservées</span>
							<span>Fin <strong>{formatTrimTime(trimEnd)}</strong></span>
						</div>
						<div class="trim-actions">
							<button type="button" class="btn btn-secondary btn-sm" onclick={playSelection} disabled={disabled || revealing}>
								{#if previewing}Arrêter · {formatTrimTime(playheadS ?? trimStart)}{:else if hasTrim}Écouter la sélection{:else}Écouter{/if}
							</button>
							{#if hasTrim}<button type="button" class="btn btn-ghost btn-sm" onclick={resetTrim} {disabled}>Tout garder</button>{/if}
						</div>
					</div>
				{/if}
				<button type="button" class="btn btn-ghost btn-sm" onclick={() => requestCancel('result')} {disabled}>
					Recommencer
				</button>
			</div>
		{:else}
			{#if devices.length > 1}
				<label class="form-label">
					Entrée audio
					<select
						class="form-input"
						bind:value={deviceId}
						onchange={() => arm(deviceId)}
						disabled={disabled || busy}
					>
						{#each devices as d, i}
							<option value={d.deviceId}>{d.label || `Entrée ${i + 1}`}</option>
						{/each}
					</select>
				</label>
			{/if}

			<div class="meter" aria-hidden="true">
				<div class="meter-fill" class:hot={meterPercent(level) > 80} class:clip={clipping} style="width: {meterPercent(level)}%"></div>
			</div>
			<p class="meter-legend" aria-live="polite">
				{#if clipping}
					<span class="clip-text">Saturation — éloigne le micro ou baisse le gain</span>
				{:else}
					Niveau d'entrée
				{/if}
			</p>

			<div class="controls">
				<span class="clock" class:live={phase === 'recording'}>
					{#if phase === 'recording'}<span class="dot"></span>{/if}
					{formatElapsed(elapsedS)}
				</span>
				{#if busy}
					<span class="size">{formatSize(sizeBytes)}</span>
				{/if}

				<div class="buttons">
					{#if phase === 'armed'}
						<button type="button" class="btn btn-primary start-btn" onclick={start} {disabled}>
							<span class="rec-dot"></span> Enregistrer
						</button>
					{:else}
						{#if phase === 'recording'}
							<button type="button" class="btn btn-secondary" onclick={pause} {disabled}>
								<Icon name="pause" /> Pause
							</button>
						{:else}
							<button type="button" class="btn btn-secondary" onclick={resume} {disabled}>
								<span class="rec-dot"></span> Reprendre
							</button>
						{/if}
						<button type="button" class="btn btn-primary" onclick={stop} {disabled}>
							<Icon name="stop" /> Terminer
						</button>
						<!-- Jeter ce qui est capté sans quitter l'écran : le micro reste ouvert. -->
						<button type="button" class="btn btn-ghost cancel-btn" onclick={() => requestCancel('recording')} {disabled}>
							Annuler
						</button>
					{/if}
				</div>
			</div>

			{#if warning}
				<p class="message-error">{warning}</p>
			{/if}
			{#if busy}
				<p class="hint">
					Garde cette page ouverte et l'écran allumé : changer d'application ou verrouiller le
					téléphone peut couper le micro.
					{#if !wakeLockOk}
						<strong>Ce navigateur ne peut pas empêcher la mise en veille : désactive-la le temps de l'enregistrement.</strong>
					{/if}
					{#if !backupOk}
						<strong>Pas de copie de secours sur cet appareil (navigation privée ?) : un plantage de l'onglet perdrait l'enregistrement.</strong>
					{/if}
				</p>
			{/if}
		{/if}
	{/if}
</div>

<!-- L'enregistrement continue pendant la question : répondre « non » ne doit rien coûter. -->
<ConfirmDialog
	open={confirming !== null}
	level="warning"
	title={confirming === 'result' ? 'Recommencer ?' : "Annuler l'enregistrement ?"}
	message={confirming === 'result'
		? `L'enregistrement de ${formatElapsed(elapsedS)} sera perdu, et le micro rouvert pour un nouveau.`
		: `Les ${formatElapsed(elapsedS)} enregistrées seront perdues. Le micro reste ouvert pour recommencer.`}
	confirmLabel={confirming === 'result' ? 'Recommencer' : "Annuler l'enregistrement"}
	cancelLabel={confirming === 'result' ? 'Garder' : "Continuer l'enregistrement"}
	onConfirm={() => (confirming === 'result' ? restart() : cancelRecording())}
	onCancel={() => (confirming = null)}
/>

<style>
	.recorder {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.recorder > .btn { align-self: flex-start; display: inline-flex; align-items: center; gap: 0.4rem; }

	.hint {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		margin: 0;
	}

	.hint strong { display: block; margin-top: 0.3rem; color: var(--color-text-secondary); }

	.pending {
		border: 1px solid var(--color-border);
		background: var(--color-bg-subtle);
		border-radius: var(--radius-md);
		padding: 0.6rem 0.75rem;
		font-size: var(--text-sm);
	}

	.pending p { margin: 0 0 0.5rem; }

	.row { display: flex; gap: 0.5rem; flex-wrap: wrap; }

	.meter {
		height: 10px;
		background: var(--color-bg-muted);
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.meter-fill {
		height: 100%;
		background: var(--color-green);
		transition: width 60ms linear;
	}

	/* Au-delà de −12 dBFS, la marge avant saturation s'amenuise. */
	.meter-fill.hot { background: var(--color-accent); }

	.meter-fill.clip { background: var(--color-error); }

	.meter-legend {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		margin: -0.4rem 0 0;
	}

	.clip-text { color: var(--color-error); font-weight: 600; }

	.controls {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem 1rem;
	}

	.clock {
		font-variant-numeric: tabular-nums;
		font-size: var(--text-xl);
		font-weight: 600;
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
	}

	.size { font-size: var(--text-sm); color: var(--color-text-muted); font-variant-numeric: tabular-nums; }

	.dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--color-error);
		animation: blink 1.2s ease-in-out infinite;
	}

	@keyframes blink { 50% { opacity: 0.25; } }

	@media (prefers-reduced-motion: reduce) {
		.dot { animation: none; }
	}

	.buttons { display: flex; gap: 0.5rem; margin-left: auto; }
	.buttons .btn { display: inline-flex; align-items: center; gap: 0.4rem; min-height: 40px; }

	/* Annuler n'est pas au même rang que Pause et Terminer : on l'atteint sans le heurter. */
	.cancel-btn { color: var(--color-text-muted); }
	.cancel-btn:hover:not(:disabled) { color: var(--color-error); }

	.rec-dot {
		width: 0.7em;
		height: 0.7em;
		border-radius: 50%;
		background: var(--color-error);
		flex-shrink: 0;
	}

	/* Lancer l'enregistrement est LE geste de la page, souvent au doigt en répétition :
	   il doit se trouver sans chercher. */
	.btn.start-btn {
		min-height: 48px;
		padding: 0.6rem 1.5rem;
		font-size: var(--text-base);
		font-weight: 600;
		gap: 0.5rem;
	}

	/* Point rouge sur fond primaire : un liseré blanc le détache. */
	.start-btn .rec-dot { box-shadow: 0 0 0 2px #fff; }

	@media (max-width: 640px) {
		.recorder > .start-btn { align-self: stretch; }
		/* Les commandes passent sous le chrono et se partagent la largeur. */
		.buttons { flex-basis: 100%; margin-left: 0; }
		.buttons .btn { flex: 1; justify-content: center; min-height: 48px; }
	}

	.result { display: flex; flex-direction: column; gap: 0.5rem; }
	.result .btn { align-self: flex-start; }
	.result audio { width: 100%; }
	.trim-editor { display: flex; flex-direction: column; gap: 0.45rem; padding: 0.75rem; border: 1px solid var(--color-border); border-radius: var(--radius-md); }
	.trim-heading { display: flex; flex-direction: column; gap: 0.1rem; font-size: var(--text-sm); }
	.trim-heading span { color: var(--color-text-muted); font-size: var(--text-xs); }
	.trim-timeline { position: relative; height: 78px; margin: 0 12px; border-radius: var(--radius-sm); background: var(--color-bg-muted); cursor: crosshair; touch-action: none; user-select: none; }
	.waveform { position: absolute; inset: 10px 0; display: flex; align-items: center; gap: 1px; overflow: hidden; pointer-events: none; }
	.waveform span { flex: 1; min-width: 0; border-radius: 2px; background: var(--color-accent); }
	.waveform-fallback { width: 100%; height: 3px; background: var(--color-accent); }
	.trim-shade { position: absolute; top: 0; bottom: 0; background: rgba(0, 0, 0, 0.48); pointer-events: none; }
	.trim-shade.left { left: 0; }
	.trim-shade.right { right: 0; }
	.trim-playhead { position: absolute; z-index: 2; top: 0; bottom: 0; width: 2px; transform: translateX(-50%); background: var(--color-text); pointer-events: none; }
	.trim-handle { position: absolute; z-index: 1; top: 0; bottom: 0; width: 24px; transform: translateX(-50%); border: 0; border-left: 3px solid var(--color-accent); border-right: 3px solid var(--color-accent); border-radius: var(--radius-md); background: rgba(255, 255, 255, 0.22); cursor: ew-resize; touch-action: none; }
	.trim-handle:focus-visible { outline: 3px solid var(--color-accent); outline-offset: 2px; }
	.trim-times { display: flex; justify-content: space-between; gap: 0.5rem; font-size: var(--text-xs); font-variant-numeric: tabular-nums; color: var(--color-text-muted); }
	.trim-times strong { color: var(--color-text); }
	.trim-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }

	.summary {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin: 0;
		font-size: var(--text-sm);
		font-weight: 600;
	}
</style>
