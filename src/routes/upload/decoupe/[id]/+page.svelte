<script lang="ts">
	import type { PageData } from './$types'
	import { untrack } from 'svelte'
	import { goto } from '$app/navigation'
	import { formatDateOnly } from '$lib/date'
	import {
		MIN_SEGMENT_LENGTH_S,
		SPLIT_BOUNDS,
		type AudioSegment,
		type SplitParams
	} from '$lib/types'

	let { data }: { data: PageData } = $props()

	/** Segment enrichi des choix de l'utilisateur : morceau visé, ou mise à l'écart. */
	type EditableSegment = AudioSegment & { song_id: string; kept: boolean }

	type Edge = 'start' | 'end'

	/** Ce que joue le lecteur : un segment entier, ou les abords d'une borne. */
	type Playing =
		| { kind: 'segment'; index: number }
		| { kind: 'boundary'; index: number; edge: Edge }
		| null

	/** Secondes écoutées de part et d'autre d'une borne (§ préécoute ciblée). */
	const BOUNDARY_MARGIN_S = 5

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
	let editingIndex = $state<number | null>(null)

	let audioEl = $state<HTMLAudioElement | null>(null)
	let playing = $state<Playing>(null)
	let playhead = $state(0)
	let stopAt = 0

	const kept = $derived(segments.filter((s) => s.kept))
	const unassigned = $derived(kept.filter((s) => !s.song_id).length)

	function toEditable(list: AudioSegment[]): EditableSegment[] {
		return list.map((s) => ({ ...s, song_id: '', kept: true }))
	}

	function round2(seconds: number): number {
		return Math.round(seconds * 100) / 100
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
		editingIndex = null

		try {
			// Dérivé des réglages eux-mêmes : un curseur ajouté part avec, sans risque
			// d'être branché à l'écran mais absent de la requête.
			const query = new URLSearchParams(
				Object.entries(params).map(([key, value]) => [key, String(value)])
			)
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
	function playRange(from: number, to: number, what: Playing) {
		if (!audioEl) return
		playing = what
		stopAt = to
		audioEl.currentTime = Math.max(0, from)
		playhead = audioEl.currentTime
		audioEl.play().catch(() => { playing = null })
	}

	function toggleSegment(index: number) {
		if (isPlaying({ kind: 'segment', index })) { stopPreview(); return }
		const segment = segments[index]
		playRange(segment.start_s, segment.end_s, { kind: 'segment', index })
	}

	/**
	 * Écoute les abords d'une borne : quelques secondes avant, quelques secondes après.
	 * C'est ce qui permet de valider une coupure sans réécouter le morceau entier.
	 */
	function toggleBoundary(index: number, edge: Edge) {
		if (isPlaying({ kind: 'boundary', index, edge })) { stopPreview(); return }
		const at = edge === 'start' ? segments[index].start_s : segments[index].end_s
		playRange(at - BOUNDARY_MARGIN_S, at + BOUNDARY_MARGIN_S, { kind: 'boundary', index, edge })
	}

	// `playing` retombe à null dès l'arrêt : le descripteur suffit à savoir quoi surligner,
	// et `audioEl.paused` n'étant pas un état réactif, le lire ici ne redessinerait rien.
	function isPlaying(what: NonNullable<Playing>): boolean {
		if (!playing || playing.kind !== what.kind || playing.index !== what.index) return false
		return playing.kind !== 'boundary' || playing.edge === (what as { edge: Edge }).edge
	}

	function stopPreview() {
		audioEl?.pause()
		playing = null
	}

	function onTimeUpdate() {
		if (!audioEl) return
		playhead = audioEl.currentTime
		if (playing && audioEl.currentTime >= stopAt) stopPreview()
	}

	// ─── Retouche des bornes ────────────────────────────────────────────────

	/**
	 * Un segment ne peut pas mordre sur ses voisins : les bornes restent ordonnées, ce
	 * qui garde « couper ici » et « fusionner » bien définis et évite qu'un même passage
	 * se retrouve dans deux prises. Tout l'espace du blanc, en revanche, est disponible.
	 */
	function limitsFor(index: number): { min: number; max: number } {
		return {
			min: index > 0 ? segments[index - 1].end_s : 0,
			max: index < segments.length - 1 ? segments[index + 1].start_s : duration
		}
	}

	function nudge(index: number, edge: Edge, delta: number) {
		const segment = segments[index]
		const { min, max } = limitsFor(index)

		if (edge === 'start') {
			const highest = segment.end_s - MIN_SEGMENT_LENGTH_S
			if (highest < min) return
			segment.start_s = round2(Math.min(Math.max(segment.start_s + delta, min), highest))
		} else {
			const lowest = segment.start_s + MIN_SEGMENT_LENGTH_S
			if (lowest > max) return
			segment.end_s = round2(Math.min(Math.max(segment.end_s + delta, lowest), max))
		}
	}

	function canSplitAt(index: number): boolean {
		const segment = segments[index]
		return (
			playhead - segment.start_s >= MIN_SEGMENT_LENGTH_S &&
			segment.end_s - playhead >= MIN_SEGMENT_LENGTH_S
		)
	}

	/** Deux prises dans un même segment : la détection a laissé passer un blanc trop court. */
	function splitAt(index: number) {
		if (!canSplitAt(index)) return
		const at = round2(playhead)
		const segment = segments[index]
		// Le morceau n'est pas recopié sur la seconde moitié : c'est justement le choix
		// que l'utilisateur vient de dire vouloir faire, et la validation l'y oblige.
		segments.splice(
			index,
			1,
			{ ...segment, end_s: at },
			{ ...segment, start_s: at, song_id: '' }
		)
		stopPreview()
		editingIndex = null
	}

	/** Un morceau coupé en deux par un silence intérieur : on recolle. */
	function mergeWithNext(index: number) {
		if (index >= segments.length - 1) return
		segments[index].end_s = segments[index + 1].end_s
		segments.splice(index + 1, 1)
		stopPreview()
		editingIndex = null
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
				class:playing={playing?.index === i}
				style="left: {percent(segment.start_s)}%; width: {percent(segment.end_s - segment.start_s)}%"
				title="Segment {i + 1} — {formatTime(segment.start_s)} → {formatTime(segment.end_s)}"
				onclick={() => toggleSegment(i)}
			>
				<span class="block-index">{i + 1}</span>
			</button>
		{/each}
		{#if playing}
			<div class="playhead" style="left: {percent(playhead)}%"></div>
		{/if}
	</div>

	<audio
		bind:this={audioEl}
		src={audioUrl}
		preload="metadata"
		ontimeupdate={onTimeUpdate}
		onseeked={onTimeUpdate}
	></audio>

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
			<label class="form-label">
				Marge conservée <span class="value">{params.pad_s.toFixed(2)} s</span>
				<input
					type="range"
					bind:value={params.pad_s}
					min={SPLIT_BOUNDS.pad_s.min}
					max={SPLIT_BOUNDS.pad_s.max}
					step={SPLIT_BOUNDS.pad_s.step}
					disabled={analysing || creating}
				/>
			</label>
		</div>
		<div class="reanalyse">
			<button type="button" class="btn btn-secondary btn-sm" onclick={reanalyse} disabled={analysing || creating}>
				{analysing ? 'Analyse en cours…' : 'Relancer l’analyse'}
			</button>
			<span class="hint">
				La marge évite de trancher une résonance de fin de morceau. Relancer remet à
				zéro les morceaux choisis et les retouches.
			</span>
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
			<p class="hint">
				Clique une borne pour écouter la jointure ({BOUNDARY_MARGIN_S} s de part et d'autre),
				« Ajuster » pour la déplacer, couper un segment en deux ou le recoller au suivant.
			</p>
			<ul class="segments">
				{#each segments as segment, i (i)}
					<li class="segment" class:dropped={!segment.kept}>
						<button
							type="button"
							class="play"
							onclick={() => toggleSegment(i)}
							aria-label="Écouter le segment {i + 1}"
						>
							{isPlaying({ kind: 'segment', index: i }) ? '❙❙' : '▶'}
						</button>

						<span class="times">
							<span class="range">
								<button
									type="button"
									class="edge"
									class:playing={isPlaying({ kind: 'boundary', index: i, edge: 'start' })}
									onclick={() => toggleBoundary(i, 'start')}
									title="Écouter le début"
								>{formatTime(segment.start_s)}</button>
								→
								<button
									type="button"
									class="edge"
									class:playing={isPlaying({ kind: 'boundary', index: i, edge: 'end' })}
									onclick={() => toggleBoundary(i, 'end')}
									title="Écouter la fin"
								>{formatTime(segment.end_s)}</button>
							</span>
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
							class="btn btn-ghost btn-sm adjust"
							onclick={() => (editingIndex = editingIndex === i ? null : i)}
							aria-expanded={editingIndex === i}
							disabled={creating}
						>
							{editingIndex === i ? 'Fermer' : 'Ajuster'}
						</button>

						<button
							type="button"
							class="btn btn-ghost btn-sm drop"
							onclick={() => (segment.kept = !segment.kept)}
							disabled={creating}
						>
							{segment.kept ? 'Écarter' : 'Rétablir'}
						</button>

						{#if editingIndex === i}
							<div class="editor">
								{#each [{ edge: 'start' as Edge, label: 'Début' }, { edge: 'end' as Edge, label: 'Fin' }] as row}
									<div class="nudge">
										<span class="nudge-label">{row.label}</span>
										<button type="button" class="btn btn-secondary btn-sm" onclick={() => nudge(i, row.edge, -5)}>−5 s</button>
										<button type="button" class="btn btn-secondary btn-sm" onclick={() => nudge(i, row.edge, -0.5)}>−0,5 s</button>
										<span class="nudge-value">
											{formatTime(row.edge === 'start' ? segment.start_s : segment.end_s)}
										</span>
										<button type="button" class="btn btn-secondary btn-sm" onclick={() => nudge(i, row.edge, 0.5)}>+0,5 s</button>
										<button type="button" class="btn btn-secondary btn-sm" onclick={() => nudge(i, row.edge, 5)}>+5 s</button>
									</div>
								{/each}

								<div class="nudge">
									<button
										type="button"
										class="btn btn-secondary btn-sm"
										onclick={() => splitAt(i)}
										disabled={!canSplitAt(i)}
										title={canSplitAt(i)
											? `Couper à ${formatTime(playhead)}`
											: 'Place la lecture à l’intérieur du segment pour couper'}
									>
										Couper à la lecture ({formatTime(playhead)})
									</button>
									<button
										type="button"
										class="btn btn-secondary btn-sm"
										onclick={() => mergeWithNext(i)}
										disabled={i >= segments.length - 1}
									>
										Fusionner avec le suivant
									</button>
								</div>
							</div>
						{/if}
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
		margin: 0;
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
		grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
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
		margin: 0.6rem 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}

	.segment {
		display: grid;
		grid-template-columns: auto 1fr minmax(0, 12rem) auto auto;
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
		color: var(--color-text-muted);
	}

	.edge {
		border: 0;
		background: none;
		padding: 0 0.1rem;
		font: inherit;
		color: var(--color-text);
		cursor: pointer;
		border-bottom: 1px dotted var(--color-border);
	}

	.edge:hover { color: var(--color-accent); }

	.edge.playing {
		color: var(--color-accent);
		border-bottom-style: solid;
		border-bottom-color: var(--color-accent);
	}

	.song { font-size: var(--text-sm); }

	/* ── Retouche d'un segment ──────────────────────────────────────────── */

	.editor {
		grid-column: 1 / -1;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		margin: 0.35rem 0 0.5rem;
		padding: 0.6rem;
		background: var(--color-bg-subtle);
		border-radius: var(--radius-md);
	}

	.nudge {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		flex-wrap: wrap;
	}

	.nudge-label {
		width: 3.2rem;
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
	}

	.nudge-value {
		min-width: 4rem;
		text-align: center;
		font-size: var(--text-sm);
		font-variant-numeric: tabular-nums;
	}

	.actions {
		display: flex;
		justify-content: space-between;
		gap: 0.75rem;
	}

	@media (max-width: 640px) {
		.segment {
			grid-template-columns: auto 1fr auto;
			grid-template-areas:
				'play times drop'
				'song song adjust'
				'edit edit edit';
		}

		.play { grid-area: play; }
		.times { grid-area: times; }
		.song { grid-area: song; }
		.adjust { grid-area: adjust; }
		.drop { grid-area: drop; }
		.editor { grid-area: edit; }
	}
</style>
