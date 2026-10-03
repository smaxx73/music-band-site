<script lang="ts">
	import { onDestroy, onMount } from 'svelte'
	import Modal from '$lib/components/Modal.svelte'
	import Icon from '$lib/components/Icon.svelte'
	import { player } from '$lib/player.svelte'
	import { formatDateTime } from '$lib/date'
	import {
		ENHANCE_TARGET_LUFS,
		EQ_LEVELS,
		EQ_LEVEL_LABELS,
		enhancePlan,
		formatDb,
		sameSettings,
		type EnhanceSettings,
		type EnhanceState,
		type EnhanceVersion
	} from '$lib/audio-enhance'

	/**
	 * Améliorer le son d'une prise : la mesure de l'original, les réglages que le module en
	 * tire — modifiables à l'oreille —, la chaîne qui en découle, et l'écoute comparée avant
	 * de décider. Rien ne change pour le groupe tant qu'on n'a pas gardé la version
	 * améliorée, et l'original se rétablit d'un geste ensuite.
	 */
	let {
		recordingId,
		initial = null,
		onClose,
		onChange
	}: {
		recordingId: number
		/** État déjà chargé par la page, qui s'en sert pour proposer l'amélioration. */
		initial?: EnhanceState | null
		onClose: () => void
		/** Le fichier de la prise a changé : la page recharge son lecteur et sa forme d'onde. */
		onChange: (state: EnhanceState) => void
	} = $props()

	// svelte-ignore state_referenced_locally
	let enhance = $state<EnhanceState | null>(initial)
	// svelte-ignore state_referenced_locally
	let loading = $state(!initial)
	let error = $state<string | null>(null)
	let busy = $state<null | 'preview' | 'apply' | 'revert' | 'session'>(null)

	// Réglages affichés : ceux de l'amélioration gardée, sinon de l'aperçu en attente,
	// sinon ceux de la dernière prise améliorée de la session — même salle, même micro,
	// l'oreille a déjà tranché —, sinon la proposition du module. Après amélioration, ils
	// se lisent sans se changer : pour en essayer d'autres, on revient d'abord à l'original.
	// svelte-ignore state_referenced_locally
	let settings = $state<EnhanceSettings | null>(settingsOf(initial))
	const plan = $derived(enhance?.analysis && settings ? enhancePlan(enhance.analysis, settings) : null)
	const locked = $derived(!!enhance?.enhanced || busy !== null)

	function settingsOf(state: EnhanceState | null): EnhanceSettings | null {
		if (!state) return null
		if (state.enhanced) return state.enhanced.settings ?? state.proposed
		return state.preview ?? state.session.last?.settings ?? state.proposed
	}

	const fromSession = $derived(
		!!enhance && !enhance.enhanced && !!enhance.session.last && sameSettings(settings, enhance.session.last.settings)
	)

	function describeSettings(value: EnhanceSettings) {
		const eq = value.eq === 'none' ? 'sans égalisation' : `égalisation ${EQ_LEVEL_LABELS[value.eq].toLowerCase()}`
		return `${eq}, ${value.compression ? 'avec' : 'sans'} compression`
	}

	// --- Le reste de la session ---
	//
	// Une prise par requête, l'une après l'autre : chacune se mesure et se rend en
	// quelques secondes, et la progression se suit prise par prise sans file d'attente
	// côté serveur. Les prises déjà améliorées ne sont pas touchées : quelqu'un les a choisies.
	type SessionRun = { done: number; total: number; current: string | null; failures: { label: string; error: string }[] }
	let sessionRun = $state<SessionRun | null>(null)
	const pendingTakes = $derived(enhance?.session.others.filter((t) => !t.enhanced) ?? [])

	async function applyToSession() {
		const applied = enhance?.enhanced?.settings ?? settings
		if (!enhance || !applied || pendingTakes.length === 0) return
		const queue = [...pendingTakes]
		busy = 'session'
		error = null
		sessionRun = { done: 0, total: queue.length, current: null, failures: [] }
		for (const take of queue) {
			const label = `${take.song_title}, prise ${take.take}`
			sessionRun.current = label
			try {
				const res = await fetch(`/api/recordings/${take.id}/enhance`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(applied)
				})
				// 409 : améliorée entre-temps par quelqu'un d'autre — elle reste comme elle est.
				if (res.ok || res.status === 409) {
					if (res.ok) player.reload(take.id)
					enhance = {
						...enhance!,
						session: {
							...enhance!.session,
							others: enhance!.session.others.map((t) => (t.id === take.id ? { ...t, enhanced: true } : t))
						}
					}
				} else {
					sessionRun.failures.push({ label, error: await readError(res, 'Échec.') })
				}
			} catch {
				sessionRun.failures.push({ label, error: 'Erreur réseau.' })
			}
			sessionRun.done += 1
		}
		sessionRun.current = null
		busy = null
	}

	// --- Écoute comparée ---
	//
	// Un seul <audio> : basculer de version change sa source et reprend à la même
	// position, dans le même état. Les deux versions partagent l'échelle de temps — rien
	// dans la chaîne ne décale le son —, c'est ce qui rend la comparaison immédiate.
	let audio = $state<HTMLAudioElement | null>(null)
	let version = $state<EnhanceVersion>('enhanced')
	// Change à chaque fichier remplacé : l'adresse change, le navigateur recharge.
	let generation = $state(Date.now())
	let playing = $state(false)
	let currentTime = $state(0)
	let duration = $state(0)
	let resume: { at: number; play: boolean } | null = null

	// Un aperçu préparé avec d'autres réglages ne se compare pas : ce ne serait pas ce
	// qu'on s'apprête à garder.
	const previewMatches = $derived(!!enhance && sameSettings(enhance.preview, settings))
	const canCompare = $derived(!!enhance && (previewMatches || !!enhance.enhanced))
	const src = $derived(`/api/recordings/${recordingId}/enhance/audio?version=${version}&g=${generation}`)

	async function readError(res: Response, fallback: string) {
		const body = (await res.json().catch(() => ({}))) as { error?: string }
		return body.error ?? fallback
	}

	onMount(() => {
		if (!enhance) void load()
	})

	onDestroy(() => audio?.pause())

	async function load() {
		loading = true
		error = null
		try {
			const res = await fetch(`/api/recordings/${recordingId}/enhance`)
			if (!res.ok) { error = await readError(res, 'Analyse impossible.'); return }
			enhance = (await res.json()) as EnhanceState
			settings = settingsOf(enhance)
		} catch {
			error = 'Erreur réseau.'
		} finally {
			loading = false
		}
	}

	function selectVersion(next: EnhanceVersion) {
		if (next === version) return
		if (audio) resume = { at: audio.currentTime, play: !audio.paused }
		version = next
	}

	function onLoaded() {
		if (!audio) return
		duration = audio.duration
		if (resume) {
			audio.currentTime = Math.min(resume.at, audio.duration || resume.at)
			if (resume.play) void audio.play().catch(() => {})
			resume = null
		}
	}

	function togglePlay() {
		if (!audio) return
		if (audio.paused) {
			// Un seul lecteur à la fois : la barre du bas se tait pendant la comparaison.
			player.pause()
			void audio.play().catch(() => {})
		} else {
			audio.pause()
		}
	}

	function formatHz(hz: number) {
		return hz >= 1000 ? `${(hz / 1000).toLocaleString('fr-FR')} kHz` : `${hz} Hz`
	}

	function formatTime(s: number) {
		if (!Number.isFinite(s)) return '0:00'
		const m = Math.floor(s / 60)
		return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`
	}

	async function preparePreview() {
		if (!settings) return
		const requested = settings
		busy = 'preview'
		error = null
		try {
			const res = await fetch(`/api/recordings/${recordingId}/enhance/preview`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(requested)
			})
			if (!res.ok) { error = await readError(res, 'Aperçu impossible.'); return }
			if (enhance) enhance = { ...enhance, preview: requested }
			version = 'enhanced'
			generation = Date.now()
		} catch {
			error = 'Erreur réseau.'
		} finally {
			busy = null
		}
	}

	async function apply() {
		if (!settings) return
		busy = 'apply'
		error = null
		audio?.pause()
		try {
			const res = await fetch(`/api/recordings/${recordingId}/enhance`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(settings)
			})
			if (!res.ok) { error = await readError(res, 'Impossible de garder la version améliorée.'); return }
			enhance = (await res.json()) as EnhanceState
			settings = settingsOf(enhance)
			generation = Date.now()
			onChange(enhance)
		} catch {
			error = 'Erreur réseau.'
		} finally {
			busy = null
		}
	}

	async function revert() {
		busy = 'revert'
		error = null
		audio?.pause()
		try {
			const res = await fetch(`/api/recordings/${recordingId}/enhance`, { method: 'DELETE' })
			if (!res.ok) { error = await readError(res, 'Impossible de rétablir l’original.'); return }
			await load()
			version = 'original'
			generation = Date.now()
			if (enhance) onChange(enhance)
		} catch {
			error = 'Erreur réseau.'
		} finally {
			busy = null
		}
	}

	// Un aperçu qu'on n'a pas gardé n'a pas à attendre le balayage du lendemain.
	function cancel() {
		if (enhance?.preview && !enhance.enhanced) {
			void fetch(`/api/recordings/${recordingId}/enhance/preview`, { method: 'DELETE' }).catch(() => {})
		}
		onClose()
	}

	function closeDialog() {
		if (busy) return
		if (enhance?.enhanced) onClose()
		else cancel()
	}
</script>

<Modal title="Améliorer le son" onClose={closeDialog}>
	<div class="modal-body enhance">
		{#if loading}
			<p class="muted">Analyse du son… quelques secondes.</p>
		{:else if enhance?.analysis && enhance.diagnosis && plan && settings}
			{@const a = enhance.analysis}
			<section>
				<h3>Mesure de l'original</h3>
				<dl class="measures">
					<div>
						<dt>Volume moyen</dt>
						<dd>{formatDb(a.integrated_lufs, 'LUFS')} <span class="muted">· visé {formatDb(ENHANCE_TARGET_LUFS, 'LUFS')}</span></dd>
					</div>
					<div>
						<dt>Écarts de volume</dt>
						<dd>{formatDb(a.lra_lu, 'LU')}</dd>
					</div>
					<div>
						<dt>Crête</dt>
						<dd>{a.true_peak_dbtp === null ? '—' : formatDb(a.true_peak_dbtp, 'dBTP')}</dd>
					</div>
					{#if a.tilt_db !== null}
						<div>
							<dt>Présence face au grave</dt>
							<dd>{formatDb(a.tilt_db, 'dB')}</dd>
						</div>
					{/if}
					{#if a.air_db !== null}
						<div>
							<dt>Aigus face au grave</dt>
							<dd>{formatDb(a.air_db, 'dB')}</dd>
						</div>
					{/if}
				</dl>
				{#if !enhance.diagnosis.enhanceable}
					<p class="issue"><Icon name="info" size="0.9rem" /> Cette prise est presque muette : il n'y a rien à améliorer.</p>
				{:else if enhance.diagnosis.issues.length === 0}
					<p class="issue ok"><Icon name="check" size="0.9rem" /> Le niveau est déjà correct : l'amélioration changera peu de chose.</p>
				{:else}
					<ul class="issues">
						{#each enhance.diagnosis.issues as issue (issue.kind)}
							<li class="issue" class:unfixable={!issue.fixable}>
								<Icon name={issue.fixable ? 'alert' : 'info'} size="0.9rem" />
								<span>
									{issue.label}{#if !issue.fixable}<span class="muted"> — l'amélioration ne le répare pas.</span>{/if}
								</span>
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			{#if enhance.diagnosis.enhanceable}
				<section>
					<h3>Réglages</h3>
					<div class="setting">
						<span class="setting-label" id="enhance-eq-label">Égalisation</span>
						<div class="choice" role="radiogroup" aria-labelledby="enhance-eq-label">
							{#each EQ_LEVELS as level (level)}
								<label class="choice-option" class:active={settings.eq === level} class:locked>
									<input
										type="radio"
										name="enhance-eq"
										checked={settings.eq === level}
										disabled={locked}
										onchange={() => (settings = { ...settings!, eq: level })}
									/>
									{EQ_LEVEL_LABELS[level]}
									{#if enhance.proposed?.eq === level}<span class="proposed">proposé</span>{/if}
								</label>
							{/each}
						</div>
					</div>
					<div class="setting">
						<span class="setting-label" id="enhance-comp-label">Compression</span>
						<div class="choice" role="radiogroup" aria-labelledby="enhance-comp-label">
							{#each [true, false] as on (on)}
								<label class="choice-option" class:active={settings.compression === on} class:locked>
									<input
										type="radio"
										name="enhance-compression"
										checked={settings.compression === on}
										disabled={locked}
										onchange={() => (settings = { ...settings!, compression: on })}
									/>
									{on ? 'Oui' : 'Non'}
									{#if enhance.proposed?.compression === on}<span class="proposed">proposé</span>{/if}
								</label>
							{/each}
						</div>
					</div>
					{#if enhance.enhanced}
						<p class="muted hint">Pour essayer d'autres réglages, reviens d'abord à l'original.</p>
					{:else if fromSession && enhance.session.last}
						<p class="muted hint">
							Repris de « {enhance.session.last.song_title} », prise {enhance.session.last.take} — la
							dernière améliorée de cette session.
							{#if enhance.proposed && !sameSettings(enhance.proposed, settings)}
								<button class="btn-link" onclick={() => (settings = enhance!.proposed)} disabled={locked}>
									Reprendre la proposition du module
								</button>
							{/if}
						</p>
					{/if}
				</section>

				<section>
					<h3>Traitement</h3>
					<ol class="chain">
						<li><strong>Gain d'entrée</strong> {formatDb(plan.pre_gain_db, 'dB')}</li>
						<li><strong>Coupe-bas léger</strong> sous {plan.highpass_hz} Hz, le grondement de la salle</li>
						<li>
							<strong>Égalisation</strong>
							{#if plan.eq.length === 0}
								aucune
							{:else}
								{plan.eq.map((b) => `${formatDb(b.gain_db, 'dB')} ${b.type === 'highshelf' ? 'au-dessus de' : 'à'} ${formatHz(b.freq_hz)}`).join(', ')}
							{/if}
						</li>
						<li>
							<strong>Compression douce</strong>
							{#if plan.compressor}
								{plan.compressor.ratio.toLocaleString('fr-FR')}:1 au-dessus de {formatDb(plan.compressor.threshold_db, 'dB')}
							{:else}
								aucune
							{/if}
						</li>
						<li><strong>Normalisation</strong> à {formatDb(plan.target_lufs, 'LUFS')}</li>
						<li><strong>Limiteur</strong> crêtes à {formatDb(plan.limit_db, 'dBFS')}</li>
					</ol>
				</section>

				<section>
					<h3>Comparer</h3>
					{#if canCompare}
						<div class="compare">
							<div class="choice" role="radiogroup" aria-label="Version écoutée">
								<label class="choice-option" class:active={version === 'original'}>
									<input type="radio" name="enhance-version" checked={version === 'original'} onchange={() => selectVersion('original')} />
									Original
								</label>
								<label class="choice-option" class:active={version === 'enhanced'}>
									<input type="radio" name="enhance-version" checked={version === 'enhanced'} onchange={() => selectVersion('enhanced')} />
									Amélioré
								</label>
							</div>
							<div class="transport">
								<button
									type="button"
									class="btn btn-secondary btn-icon"
									onclick={togglePlay}
									aria-label={playing ? 'Mettre en pause' : 'Écouter'}
								>
									<Icon name={playing ? 'pause' : 'play'} size="1rem" />
								</button>
								<span class="time">{formatTime(currentTime)}</span>
								<input
									type="range"
									class="seek"
									min="0"
									max={duration || 0}
									step="0.1"
									value={currentTime}
									aria-label="Position"
									oninput={(e) => { if (audio) audio.currentTime = Number(e.currentTarget.value) }}
								/>
								<span class="time">{formatTime(duration)}</span>
							</div>
							<!-- svelte-ignore a11y_media_has_caption -->
							<audio
								bind:this={audio}
								{src}
								preload="metadata"
								onloadedmetadata={onLoaded}
								ontimeupdate={() => (currentTime = audio?.currentTime ?? 0)}
								onplay={() => (playing = true)}
								onpause={() => (playing = false)}
								onended={() => (playing = false)}
							></audio>
							<p class="muted hint">
								Bascule en pleine écoute : la lecture reprend au même endroit. La version la plus
								forte paraît souvent meilleure — écoute aussi le détail.
							</p>
						</div>
					{:else}
						<button class="btn btn-primary" onclick={preparePreview} disabled={busy !== null}>
							<Icon name="sliders" size="0.95rem" />
							{busy === 'preview'
								? 'Préparation… quelques secondes'
								: enhance.preview ? 'Préparer avec ces réglages' : 'Préparer la version améliorée'}
						</button>
						<p class="muted hint">Rien ne change pour le groupe avant que tu ne la gardes.</p>
					{/if}
				</section>

				{#if enhance.enhanced && enhance.session.others.length > 0}
					{@const applied = enhance.enhanced.settings ?? settings}
					<section>
						<h3>Autres prises de la session</h3>
						{#if sessionRun?.current}
							<progress class="run" max={sessionRun.total} value={sessionRun.done}></progress>
							<p class="muted hint">
								{sessionRun.done + 1} / {sessionRun.total} — {sessionRun.current}… Garde la fenêtre ouverte.
							</p>
						{:else}
							{#if sessionRun}
								<p class="message-ok">
									{sessionRun.total - sessionRun.failures.length} prise{sessionRun.total - sessionRun.failures.length > 1 ? 's' : ''}
									améliorée{sessionRun.total - sessionRun.failures.length > 1 ? 's' : ''}.
								</p>
								{#each sessionRun.failures as failure (failure.label)}
									<p class="message-error">{failure.label} : {failure.error}</p>
								{/each}
							{/if}
							{#if pendingTakes.length === 0}
								{#if !sessionRun}<p class="muted hint">Toutes les prises de la session sont améliorées.</p>{/if}
							{:else}
								<p class="session-pending">
									{pendingTakes.length === 1 ? 'Une prise n’est' : `${pendingTakes.length} prises ne sont`} pas encore
									améliorée{pendingTakes.length > 1 ? 's' : ''} :
									<span class="muted">{pendingTakes.map((t) => `${t.song_title} (${t.take})`).join(', ')}</span>
								</p>
								<div>
									<button class="btn btn-secondary btn-sm" onclick={applyToSession} disabled={busy !== null}>
										<Icon name="sliders" size="0.85rem" />
										Appliquer à {pendingTakes.length === 1 ? 'cette prise' : `ces ${pendingTakes.length} prises`}
									</button>
								</div>
								{#if applied}
									<p class="muted hint">
										Mêmes réglages ({describeSettings(applied)}) ; le volume et le taux de
										compression s'ajustent à chacune. Chaque prise se rétablit ensuite à part.
									</p>
								{/if}
							{/if}
						{/if}
					</section>
				{/if}
			{/if}
		{/if}
		{#if error}<p class="message-error">{error}</p>{/if}
	</div>

	<div class="modal-footer">
		{#if enhance?.enhanced}
			<p class="muted footer-note">
				Amélioré{enhance.enhanced.by ? ` par ${enhance.enhanced.by}` : ''}, {formatDateTime(enhance.enhanced.at)}
			</p>
			<button class="btn btn-secondary" onclick={revert} disabled={busy !== null}>
				{busy === 'revert' ? 'Rétablissement…' : 'Revenir à l’original'}
			</button>
			<button class="btn btn-secondary" onclick={onClose} disabled={busy !== null}>Fermer</button>
		{:else}
			<button class="btn btn-secondary" onclick={cancel} disabled={busy !== null}>Annuler</button>
			{#if enhance?.diagnosis?.enhanceable}
				<button class="btn btn-primary" onclick={apply} disabled={busy !== null || !previewMatches}>
					{busy === 'apply' ? 'Application…' : 'Garder la version améliorée'}
				</button>
			{/if}
		{/if}
	</div>
</Modal>

<style>
	.enhance { display: flex; flex-direction: column; gap: 1.1rem; }
	section { display: flex; flex-direction: column; gap: 0.5rem; }
	h3 {
		margin: 0;
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-text-muted);
	}

	.measures { display: flex; flex-wrap: wrap; gap: 0.5rem 1.5rem; margin: 0; }
	.measures dt { font-size: var(--text-xs); color: var(--color-text-muted); }
	.measures dd { margin: 0; font-size: var(--text-sm); font-variant-numeric: tabular-nums; }

	.issues { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.3rem; }
	.issue {
		display: flex; align-items: flex-start; gap: 0.4rem; margin: 0;
		font-size: var(--text-sm); color: var(--color-warning-text);
	}
	.issue :global(.icon) { margin-top: 0.15rem; }
	.issue.unfixable, .issue.ok { color: var(--color-text-secondary); }

	.chain { margin: 0; padding-left: 1.3rem; display: flex; flex-direction: column; gap: 0.2rem; font-size: var(--text-sm); }
	.chain strong { font-weight: 600; }

	.compare { display: flex; flex-direction: column; gap: 0.6rem; }
	.setting { display: flex; align-items: center; gap: 0.4rem 0.8rem; flex-wrap: wrap; }
	.setting-label { font-size: var(--text-sm); min-width: 6.5rem; }
	.choice { display: flex; flex-wrap: wrap; gap: 0.4rem; }
	.choice-option {
		position: relative;
		display: inline-flex; align-items: center; gap: 0.35rem;
		padding: 0.35rem 0.8rem; border: 1px solid var(--color-border-input);
		border-radius: var(--radius-pill); font-size: var(--text-sm); cursor: pointer;
	}
	.choice-option.active { border-color: var(--color-primary); background: var(--color-bg-muted); font-weight: 600; }
	.choice-option.locked { cursor: default; }
	.choice-option.locked:not(.active) { color: var(--color-text-muted); }
	/* Le rond natif doublerait la pastille, qui dit déjà ce qui est choisi. */
	.choice-option input { position: absolute; opacity: 0; pointer-events: none; }
	.choice-option:has(input:focus-visible) { outline: 2px solid var(--color-accent); outline-offset: 2px; }
	.proposed {
		font-size: var(--text-2xs); font-weight: 400; color: var(--color-text-muted);
		text-transform: uppercase; letter-spacing: 0.03em;
	}

	.transport { display: flex; align-items: center; gap: 0.6rem; }
	.time { font-size: var(--text-xs); color: var(--color-text-muted); font-variant-numeric: tabular-nums; min-width: 2.6rem; }
	.time:last-child { text-align: right; }
	.seek { flex: 1; min-width: 0; accent-color: var(--color-accent); }

	.hint { margin: 0; font-size: var(--text-xs); }
	.session-pending { margin: 0; font-size: var(--text-sm); }
	.run { width: 100%; accent-color: var(--color-accent); }
	.muted { color: var(--color-text-muted); }

	.footer-note { margin: 0 auto 0 0; align-self: center; font-size: var(--text-xs); }
	@media (max-width: 640px) {
		.modal-footer { flex-wrap: wrap; }
		.footer-note { flex-basis: 100%; }
	}
</style>
