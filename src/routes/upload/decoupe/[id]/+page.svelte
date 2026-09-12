<script lang="ts">
	import type { PageData } from './$types'
	import { untrack } from 'svelte'
	import { goto } from '$app/navigation'
	import { formatDateOnly } from '$lib/date'
	import { SPLIT_BOUNDS, type AudioSegment, type SplitParams } from '$lib/types'

	let { data }: { data: PageData } = $props()

	/** Segment enrichi des choix de l'utilisateur : morceau visé, ou mise à l'écart. */
	type EditableSegment = AudioSegment & { song_id: string; kept: boolean }

	const audioUrl = $derived(`/api/imports/${data.audioImport.id}/audio`)

	// L'analyse rendue par le serveur n'est qu'un point de départ : l'écran en prend la
	// main aussitôt et la remplace à chaque relance. `untrack` dit que cette lecture
	// est volontairement une graine, pas une source réactive.
	const initial = untrack(() => ({
		segments: toEditable(data.segments),
		params: { ...data.params },
		sessionId: String(data.audioImport.session_id ?? ''),
		duration: data.duration_s,
		peaks: data.peaks,
		error: data.analysisError
	}))

	let segments = $state<EditableSegment[]>(initial.segments)
	let params = $state<SplitParams>(initial.params)
	let sessionId = $state<string>(initial.sessionId)
	let duration = $state<number>(initial.duration)
	let peaks = $state<number[]>(initial.peaks)

	let analysing = $state(false)
	let creating = $state(false)
	let error = $state<string | null>(initial.error)

	let audioEl = $state<HTMLAudioElement | null>(null)
	let playingIndex = $state<number | null>(null)
	let playhead = $state(0)
	let stopAt = 0

	const kept = $derived(segments.filter((s) => s.kept))
	const unassigned = $derived(kept.filter((s) => !s.song_id).length)

	function toEditable(list: AudioSegment[]): EditableSegment[] {
		return list.map((s) => ({ ...s, song_id: '', kept: true }))
	}

	function formatTime(seconds: number): string {
		const total = Math.max(0, Math.round(seconds))
		const h = Math.floor(total / 3600)
		const m = Math.floor((total % 3600) / 60)
		const s = total % 60
		const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
		return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`
	}

	/** Le format de l'original : c'est lui qui sera taillé, autant le dire à l'écran. */
	function formatSource(mime: string | null): string {
		if (!mime) return 'original'
		const known: Record<string, string> = {
			'audio/mpeg': 'MP3',
			'audio/mp3': 'MP3',
			'audio/wav': 'WAV',
			'audio/x-wav': 'WAV',
			'audio/wave': 'WAV',
			'audio/flac': 'FLAC',
			'audio/x-flac': 'FLAC',
			'audio/mp4': 'M4A',
			'audio/x-m4a': 'M4A',
			'audio/aac': 'AAC',
			'audio/ogg': 'OGG',
			'audio/opus': 'Opus'
		}
		return known[mime] ?? mime.replace(/^audio\//, '').toUpperCase()
	}

	function formatSession(s: { date: string; location: string | null }) {
		const date = formatDateOnly(s.date, { day: '2-digit', month: 'short', year: 'numeric' })
		return s.location ? `${date} — ${s.location}` : date
	}

	// ─── Analyse ────────────────────────────────────────────────────────────

	async function reanalyse() {
		if (analysing) return
		analysing = true
		error = null
		stopPreview()

		try {
			const query = new URLSearchParams({
				threshold_db: String(params.threshold_db),
				min_silence_s: String(params.min_silence_s),
				min_segment_s: String(params.min_segment_s)
			})
			const res = await fetch(`/api/imports/${data.audioImport.id}?${query}`)
			const payload = await res.json()
			if (!res.ok) {
				error = payload.error ?? 'Analyse impossible.'
				return
			}
			segments = toEditable(payload.segments)
			params = payload.params
			duration = payload.duration_s
			if (payload.peaks?.length) peaks = payload.peaks
		} catch {
			error = 'Erreur réseau pendant l’analyse.'
		} finally {
			analysing = false
		}
	}

	// ─── Pré-écoute ─────────────────────────────────────────────────────────

	// Un seul élément audio pour tout le fichier : on s'y déplace, plutôt que de
	// demander au serveur un extrait par segment avant même d'avoir validé quoi que ce soit.
	function togglePreview(index: number) {
		if (!audioEl) return
		if (playingIndex === index && !audioEl.paused) {
			stopPreview()
			return
		}
		const segment = segments[index]
		playingIndex = index
		stopAt = segment.end_s
		audioEl.currentTime = segment.start_s
		audioEl.play().catch(() => { playingIndex = null })
	}

	function stopPreview() {
		audioEl?.pause()
		playingIndex = null
	}

	function onTimeUpdate() {
		if (!audioEl) return
		playhead = audioEl.currentTime
		if (playingIndex !== null && audioEl.currentTime >= stopAt) stopPreview()
	}

	// ─── Création des prises ────────────────────────────────────────────────

	async function createTakes() {
		if (creating) return
		if (kept.length === 0) { error = 'Aucun segment retenu.'; return }
		if (unassigned > 0) { error = 'Chaque segment retenu doit être rattaché à un morceau.'; return }

		creating = true
		error = null
		stopPreview()

		try {
			const res = await fetch(`/api/imports/${data.audioImport.id}/split`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					session_id: Number(sessionId),
					segments: kept.map((s) => ({
						start_s: s.start_s,
						end_s: s.end_s,
						song_id: Number(s.song_id)
					}))
				})
			})
			const payload = await res.json()
			if (!res.ok) {
				error = payload.error ?? 'Erreur lors de la découpe.'
				return
			}
			await goto(`/sessions/${payload.session_id}`)
		} catch {
			error = 'Erreur réseau pendant la découpe.'
		} finally {
			creating = false
		}
	}

	async function abandon() {
		if (!confirm('Abandonner cet import ? Le fichier envoyé sera supprimé.')) return
		stopPreview()
		await fetch(`/api/imports/${data.audioImport.id}`, { method: 'DELETE' })
		await goto('/upload')
	}

	// ─── Forme d'onde de survol ─────────────────────────────────────────────

	const WAVE_HEIGHT = 56

	// Un seul `path` pour toute la forme d'onde : un rectangle par point saturerait
	// le DOM sur une heure d'enregistrement.
	const wavePath = $derived(
		peaks
			.map((peak, i) => {
				const x = (i / Math.max(1, peaks.length - 1)) * 100
				const half = Math.max(0.5, peak * (WAVE_HEIGHT / 2))
				return `M${x.toFixed(3)} ${(WAVE_HEIGHT / 2 - half).toFixed(2)}V${(WAVE_HEIGHT / 2 + half).toFixed(2)}`
			})
			.join('')
	)

	function percent(seconds: number): number {
		return duration > 0 ? (seconds / duration) * 100 : 0
	}
</script>

<svelte:head>
	<title>Découper l'enregistrement</title>
</svelte:head>

<main>
	<div class="page-header">
		<h1>Découper l'enregistrement</h1>
		<a href="/upload" class="btn btn-ghost btn-sm back-link">← Upload</a>
	</div>

	<p class="source">
		<strong>{data.audioImport.file_name}</strong>
		<span class="hint">
			· {formatTime(duration)} · {segments.length} segment{segments.length > 1 ? 's' : ''} détecté{segments.length > 1 ? 's' : ''}
		</span>
	</p>
	<p class="hint">
		Analyse et écoute sur une copie allégée ; les prises seront taillées dans
		l'original ({formatSource(data.audioImport.source_mime)}).
	</p>

	{#if error}
		<p class="message-error" style="margin-bottom: 0.75rem;">{error}</p>
	{/if}

	<!-- Survol : forme d'onde du fichier entier, segments retenus en surimpression -->
	<div class="overview">
		<svg viewBox="0 0 100 {WAVE_HEIGHT}" preserveAspectRatio="none" role="presentation">
			<path d={wavePath} vector-effect="non-scaling-stroke" />
		</svg>
		{#each segments as segment, i}
			<button
				type="button"
				class="block"
				class:dropped={!segment.kept}
				class:playing={playingIndex === i}
				style="left: {percent(segment.start_s)}%; width: {percent(segment.end_s - segment.start_s)}%"
				title="Segment {i + 1} — {formatTime(segment.start_s)} → {formatTime(segment.end_s)}"
				onclick={() => togglePreview(i)}
			>
				<span class="block-index">{i + 1}</span>
			</button>
		{/each}
		{#if playingIndex !== null}
			<div class="playhead" style="left: {percent(playhead)}%"></div>
		{/if}
	</div>

	<audio bind:this={audioEl} src={audioUrl} preload="metadata" ontimeupdate={onTimeUpdate}></audio>

	<!-- Réglages de détection -->
	<fieldset>
		<legend>Détection des blancs</legend>
		<div class="sliders">
			<label class="form-label">
				Seuil de silence <span class="value">{params.threshold_db} dB</span>
				<input
					type="range"
					bind:value={params.threshold_db}
					min={SPLIT_BOUNDS.threshold_db.min}
					max={SPLIT_BOUNDS.threshold_db.max}
					step={SPLIT_BOUNDS.threshold_db.step}
					disabled={analysing || creating}
				/>
			</label>
			<label class="form-label">
				Blanc minimum <span class="value">{params.min_silence_s.toFixed(1)} s</span>
				<input
					type="range"
					bind:value={params.min_silence_s}
					min={SPLIT_BOUNDS.min_silence_s.min}
					max={SPLIT_BOUNDS.min_silence_s.max}
					step={SPLIT_BOUNDS.min_silence_s.step}
					disabled={analysing || creating}
				/>
			</label>
			<label class="form-label">
				Prise minimum <span class="value">{params.min_segment_s} s</span>
				<input
					type="range"
					bind:value={params.min_segment_s}
					min={SPLIT_BOUNDS.min_segment_s.min}
					max={SPLIT_BOUNDS.min_segment_s.max}
					step={SPLIT_BOUNDS.min_segment_s.step}
					disabled={analysing || creating}
				/>
			</label>
		</div>
		<div class="reanalyse">
			<button type="button" class="btn btn-secondary btn-sm" onclick={reanalyse} disabled={analysing || creating}>
				{analysing ? 'Analyse en cours…' : 'Relancer l’analyse'}
			</button>
			<span class="hint">Le fichier reste sur le serveur — relancer remet à zéro les morceaux choisis.</span>
		</div>
	</fieldset>

	<!-- Destination -->
	<fieldset>
		<legend>Session</legend>
		<label class="form-label">
			Les prises seront ajoutées à
			<select class="form-input" bind:value={sessionId} disabled={creating}>
				{#each data.sessions as s}
					<option value={String(s.id)}>{formatSession(s)}</option>
				{/each}
			</select>
		</label>
	</fieldset>

	<!-- Segments -->
	<fieldset>
		<legend>Segments</legend>
		{#if segments.length === 0}
			<p class="hint">
				Aucun passage sonore détecté avec ces réglages. Baisse le seuil ou la durée
				minimale d'une prise, puis relance l'analyse.
			</p>
		{:else if data.songs.length === 0}
			<p class="hint">
				Aucun morceau au référentiel du groupe.
				<a href="/songs">Ajouter des morceaux →</a>
			</p>
		{:else}
			<ul class="segments">
				{#each segments as segment, i (i)}
					<li class="segment" class:dropped={!segment.kept}>
						<button
							type="button"
							class="play"
							onclick={() => togglePreview(i)}
							aria-label="Écouter le segment {i + 1}"
						>
							{playingIndex === i ? '❙❙' : '▶'}
						</button>

						<span class="times">
							<span class="range">{formatTime(segment.start_s)} → {formatTime(segment.end_s)}</span>
							<span class="hint">{formatTime(segment.end_s - segment.start_s)}</span>
						</span>

						<select
							class="form-input song"
							bind:value={segment.song_id}
							disabled={!segment.kept || creating}
						>
							<option value="">— Morceau —</option>
							{#each data.songs as song}
								<option value={String(song.id)}>{song.title}</option>
							{/each}
						</select>

						<button
							type="button"
							class="btn btn-ghost btn-sm"
							onclick={() => (segment.kept = !segment.kept)}
							disabled={creating}
						>
							{segment.kept ? 'Écarter' : 'Rétablir'}
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</fieldset>

	<div class="actions">
		<button type="button" class="btn btn-ghost" onclick={abandon} disabled={creating}>
			Abandonner l'import
		</button>
		<button
			type="button"
			class="btn btn-primary"
			onclick={createTakes}
			disabled={creating || analysing || kept.length === 0 || unassigned > 0 || !sessionId}
		>
			{#if creating}
				Découpe en cours…
			{:else}
				Créer {kept.length} prise{kept.length > 1 ? 's' : ''}
			{/if}
		</button>
	</div>

	{#if unassigned > 0}
		<p class="hint right">
			{unassigned} segment{unassigned > 1 ? 's' : ''} sans morceau — choisis-le ou écarte-le.
		</p>
	{/if}
</main>

<style>
	main {
		max-width: 780px;
		margin: 2rem auto;
		padding: 0 1rem;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	h1 {
		font-size: var(--text-xl);
		margin: 0;
	}

	.back-link { color: var(--color-text-muted); }

	.source { margin: -0.75rem 0 0; font-size: var(--text-sm); }

	.hint {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		font-weight: 400;
	}

	.hint.right { text-align: right; margin: -0.75rem 0 0; }

	fieldset {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: 1rem;
		margin: 0;
	}

	legend {
		font-weight: 700;
		font-size: 0.85rem;
		text-transform: uppercase;
		color: var(--color-text-secondary);
		padding: 0 0.25rem;
	}

	/* ── Survol ─────────────────────────────────────────────────────────── */

	.overview {
		position: relative;
		height: 56px;
		background: var(--color-bg-subtle);
		border: 1px solid var(--color-border-light);
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.overview svg {
		width: 100%;
		height: 100%;
		display: block;
	}

	.overview path {
		stroke: var(--color-mid);
		stroke-width: 1px;
		fill: none;
	}

	.block {
		position: absolute;
		top: 0;
		bottom: 0;
		min-width: 2px;
		padding: 0;
		border: 0;
		border-left: 1px solid var(--color-accent);
		border-right: 1px solid var(--color-accent);
		background: rgba(226, 94, 54, 0.18);
		cursor: pointer;
	}

	.block:hover { background: rgba(226, 94, 54, 0.3); }

	.block.playing { background: rgba(226, 94, 54, 0.42); }

	.block.dropped {
		background: transparent;
		border-color: var(--color-border);
	}

	.block-index {
		position: absolute;
		top: 2px;
		left: 3px;
		font-size: 0.65rem;
		color: var(--color-text-secondary);
	}

	.playhead {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 1px;
		background: var(--color-ink);
		pointer-events: none;
	}

	/* ── Réglages ───────────────────────────────────────────────────────── */

	.sliders {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.75rem;
	}

	.value {
		font-weight: 400;
		color: var(--color-text-secondary);
	}

	.sliders input[type='range'] { width: 100%; }

	.reanalyse {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin-top: 0.8rem;
		flex-wrap: wrap;
	}

	/* ── Segments ───────────────────────────────────────────────────────── */

	.segments {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}

	.segment {
		display: grid;
		grid-template-columns: auto 1fr minmax(0, 12rem) auto;
		align-items: center;
		gap: 0.6rem;
		padding: 0.45rem 0;
		border-bottom: 1px solid var(--color-border-light);
	}

	.segment:last-child { border-bottom: 0; }

	.segment.dropped { opacity: 0.45; }

	.play {
		width: 2rem;
		height: 2rem;
		border: 1px solid var(--color-border-input);
		border-radius: 50%;
		background: var(--color-bg);
		cursor: pointer;
		font-size: 0.7rem;
		line-height: 1;
	}

	.play:hover { background: var(--color-bg-muted); }

	.times {
		display: flex;
		flex-direction: column;
		line-height: 1.3;
	}

	.range {
		font-size: var(--text-sm);
		font-variant-numeric: tabular-nums;
	}

	.song { font-size: var(--text-sm); }

	.actions {
		display: flex;
		justify-content: space-between;
		gap: 0.75rem;
	}

	@media (max-width: 640px) {
		.sliders { grid-template-columns: 1fr; }

		.segment {
			grid-template-columns: auto 1fr auto;
			grid-template-areas: 'play times drop' 'song song song';
		}

		.play { grid-area: play; }
		.times { grid-area: times; }
		.song { grid-area: song; }
	}
</style>
