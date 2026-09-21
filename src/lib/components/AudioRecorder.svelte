<script lang="ts">
	import { onDestroy, onMount } from 'svelte'
	import Icon from './Icon.svelte'
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
		onbusychange
	}: {
		disabled?: boolean
		/** Enregistrement prêt à envoyer (et sa durée), ou `null` quand il est écarté. */
		onchange: (file: File | null, durationS: number) => void
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

	type Phase = 'idle' | 'arming' | 'armed' | 'recording' | 'paused' | 'done'
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
	let backupOk = $state(true)
	let wakeLockOk = $state(true)

	let previewUrl = $state<string | null>(null)
	let resultFile = $state<File | null>(null)

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

	const supported =
		typeof navigator !== 'undefined' &&
		!!navigator.mediaDevices?.getUserMedia &&
		typeof MediaRecorder !== 'undefined'

	const busy = $derived(phase === 'recording' || phase === 'paused')
	$effect(() => onbusychange?.(busy))

	onMount(async () => {
		try {
			pending = await findPendingTake()
		} catch {
			// Pas de stockage local : rien à reprendre, l'enregistrement marchera sans secours.
		}
	})

	onDestroy(() => {
		if (recorder && recorder.state !== 'inactive') recorder.stop()
		releaseInput()
		stopTimer()
		releaseWakeLock()
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

		// Les libellés des entrées ne sont donnés qu'une fois l'accès accordé.
		const all = await navigator.mediaDevices.enumerateDevices()
		devices = all.filter((d) => d.kind === 'audioinput')
		deviceId = stream.getAudioTracks()[0]?.getSettings().deviceId ?? id

		stream.getAudioTracks()[0]?.addEventListener('ended', onInputLost)
		startMeter(stream)
		phase = 'armed'
	}

	function onInputLost() {
		if (phase === 'recording' || phase === 'paused') {
			error = "L'entrée audio a été débranchée : l'enregistrement s'est arrêté, ce qui a été capté est conservé."
			stop()
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
		if (!stream) return
		error = null
		warning = null
		discardResult()

		const mimeType = pickMimeType()
		try {
			recorder = new MediaRecorder(stream, {
				...(mimeType ? { mimeType } : {}),
				audioBitsPerSecond: BITRATE
			})
		} catch {
			error = "Ce navigateur ne sait pas enregistrer l'audio."
			return
		}

		chunks = []
		seq = 0
		sizeBytes = 0
		elapsedS = 0
		elapsedBeforeSegment = 0
		take = {
			id: Date.now(),
			// Le type effectif, sans ses paramètres (`;codecs=opus`) : le serveur compare
			// le type exact à `audio_formats`.
			mimeType: baseMime(recorder.mimeType || mimeType || 'audio/webm'),
			startedAt: Date.now(),
			durationS: 0,
			sizeBytes: 0
		}

		backupOk = true
		try {
			await clearTakes()
			await beginTake(take)
		} catch {
			backupOk = false
		}

		recorder.ondataavailable = (e) => onChunk(e.data)
		recorder.onstop = onRecorderStop
		recorder.start(TIMESLICE_MS)

		segmentStartedAt = performance.now()
		phase = 'recording'
		startTimer()
		acquireWakeLock()
		window.addEventListener('beforeunload', onBeforeUnload)
		document.addEventListener('visibilitychange', onVisibility)
	}

	function onChunk(data: Blob) {
		if (!data.size || !take) return
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
		if (!recorder || recorder.state === 'inactive') return
		if (phase === 'recording') elapsedBeforeSegment = currentElapsed()
		// Le dernier bloc arrive par `dataavailable` juste avant `stop`.
		recorder.stop()
	}

	function onRecorderStop() {
		stopTimer()
		releaseWakeLock()
		window.removeEventListener('beforeunload', onBeforeUnload)
		document.removeEventListener('visibilitychange', onVisibility)
		elapsedS = elapsedBeforeSegment
		if (!take || chunks.length === 0) {
			phase = stream ? 'armed' : 'idle'
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
		resultFile = new File([blob], fileName(t), { type: t.mimeType })
		sizeBytes = blob.size
		elapsedS = durationS
		phase = 'done'
		// Le micro n'a plus à rester ouvert : le voyant d'enregistrement du système s'éteint.
		releaseInput()
		onchange(resultFile, durationS)
	}

	function discardResult() {
		if (previewUrl) URL.revokeObjectURL(previewUrl)
		previewUrl = null
		resultFile = null
		onchange(null, 0)
	}

	async function restart() {
		discardResult()
		await clearTakes().catch(() => {})
		await arm()
	}

	async function recoverPending() {
		if (!pending) return
		try {
			const blob = await assembleTake(pending)
			if (!blob.size) throw new Error('vide')
			const t = pending
			pending = null
			setResult(blob, t, t.durationS)
		} catch {
			error = "L'enregistrement conservé n'a pas pu être relu."
		}
	}

	async function dropPending() {
		pending = null
		await clearTakes().catch(() => {})
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
					<button type="button" class="btn btn-secondary btn-sm" onclick={recoverPending} {disabled}>
						Récupérer
					</button>
					<button type="button" class="btn btn-ghost btn-sm" onclick={dropPending} {disabled}>
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
				class="btn btn-secondary"
				onclick={() => arm()}
				disabled={disabled || phase === 'arming' || !!pending}
			>
				<Icon name="mic" />
				{phase === 'arming' ? 'Ouverture du micro…' : 'Activer le micro'}
			</button>
			<p class="hint">
				Micro de l'appareil, casque ou interface audio branchée. Le son est capté tel quel,
				sans les corrections automatiques des appels vidéo.
			</p>
		{:else if phase === 'done'}
			<div class="result">
				<p class="summary">
					<Icon name="check" />
					Enregistrement prêt — {formatElapsed(elapsedS)} · {formatSize(sizeBytes)}
				</p>
				{#if previewUrl}
					<audio controls src={previewUrl} preload="metadata"></audio>
				{/if}
				<button type="button" class="btn btn-ghost btn-sm" onclick={restart} {disabled}>
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
						<button type="button" class="btn btn-primary rec-btn" onclick={start} {disabled}>
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

<style>
	.recorder {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.recorder > .btn { align-self: flex-start; display: inline-flex; align-items: center; gap: 0.4rem; }

	.hint {
		font-size: 0.8rem;
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
		font-size: 0.75rem;
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

	.rec-dot {
		width: 0.7em;
		height: 0.7em;
		border-radius: 50%;
		background: var(--color-error);
		flex-shrink: 0;
	}

	.result { display: flex; flex-direction: column; gap: 0.5rem; }
	.result .btn { align-self: flex-start; }
	.result audio { width: 100%; }

	.summary {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin: 0;
		font-size: var(--text-sm);
		font-weight: 600;
	}
</style>
