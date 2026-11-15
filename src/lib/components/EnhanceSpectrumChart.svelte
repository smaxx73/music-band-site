<script lang="ts">
	import { formatDb, type AudioProfile, type EnhancePlan } from '$lib/audio-enhance'
	import { denoiseThresholdDb, planResponseDb } from '$lib/audio-enhance-curves'

	/**
	 * Le timbre d'une prise, en deux graphiques qui partagent l'axe des fréquences : son
	 * spectre mesuré (avec le niveau de ses moments les plus calmes, et le seuil du
	 * débruiteur s'il est en service), puis la correction que la chaîne lui applique.
	 *
	 * Deux graphiques et non un : une égalisation de 3 dB ne se lit pas sur l'échelle de
	 * 80 dB d'un spectre. La correction a donc sa propre échelle, à quelques dB près.
	 */
	let { profile, plan }: { profile: AudioProfile; plan: EnhancePlan } = $props()
	// Les tracés sont rognés au cadre de leur graphique : il faut un identifiant par instance.
	const uid = $props.id()

	const F_MIN = 20
	const F_MAX = 20000
	const LEFT = 48
	const RIGHT = 10
	const SPECTRUM_H = 170
	const RESPONSE_H = 96
	const TOP = 8
	const BOTTOM = 20

	let width = $state(560)
	const plotW = $derived(Math.max(120, width - LEFT - RIGHT))
	const x = (hz: number) => LEFT + (Math.log(hz / F_MIN) / Math.log(F_MAX / F_MIN)) * plotW

	const allTicks = [50, 100, 200, 500, 1000, 2000, 5000, 10000]
	const xTicks = $derived(plotW < 300 ? [100, 1000, 10000] : allTicks)
	const hz = (f: number) => (f >= 1000 ? `${(f / 1000).toLocaleString('fr-FR')} kHz` : `${f} Hz`)
	const tickLabel = (f: number) => (f >= 1000 ? `${f / 1000}k` : String(f))

	// --- Spectre ---
	const threshold = $derived(
		plan.denoise ? profile.freqs_hz.map((f) => denoiseThresholdDb(plan.denoise!.floor_db, f)) : null
	)
	const specMax = $derived(Math.ceil((Math.max(...profile.mean_db) + 3) / 10) * 10)
	const specMin = $derived.by(() => {
		// Le bas de l'échelle suit le bruit là où il compte : sous 50 Hz et au-dessus de
		// 10 kHz, un mp3 ne porte presque plus rien, et l'échelle s'y perdrait.
		const lows = profile.noise_db.filter((_, i) => profile.freqs_hz[i] >= 50 && profile.freqs_hz[i] <= 10000)
		const floor = Math.floor((Math.min(...lows) - 6) / 10) * 10
		return Math.max(specMax - 80, Math.min(floor, specMax - 40))
	})
	const specTicks = $derived(ticks(specMin, specMax, specMax - specMin > 60 ? 20 : 10))
	const specY = (db: number) => TOP + ((specMax - db) / (specMax - specMin)) * (SPECTRUM_H - TOP - BOTTOM)
	const signed = (db: number) => (db > 0 ? `+${db}` : db < 0 ? `−${-db}` : '0')

	// --- Correction ---
	const RESPONSE_POINTS = 120
	const response = $derived(
		Array.from({ length: RESPONSE_POINTS + 1 }, (_, i) => {
			const f = F_MIN * (F_MAX / F_MIN) ** (i / RESPONSE_POINTS)
			return { f, db: planResponseDb(plan, f) }
		})
	)
	// Une échelle fixe tant que la correction y tient : la courbe ne change pas d'allure
	// d'un cran de curseur à l'autre. Le coupe-bas plonge sous le cadre, qui le rogne.
	const respSpan = $derived(
		Math.max(...response.filter((p) => p.f >= 60).map((p) => Math.abs(p.db))) > 6 ? 12 : 6
	)
	const respY = (db: number) => TOP + ((respSpan - db) / (2 * respSpan)) * (RESPONSE_H - TOP - BOTTOM)
	const flat = $derived(response.every((p) => Math.abs(p.db) < 0.05))

	function ticks(min: number, max: number, step: number) {
		const list: number[] = []
		for (let v = max; v >= min; v -= step) list.push(v)
		return list
	}

	function path(points: { px: number; py: number }[]) {
		return points.map((p, i) => `${i ? 'L' : 'M'}${p.px.toFixed(1)},${p.py.toFixed(1)}`).join('')
	}

	const meanPath = $derived(path(profile.freqs_hz.map((f, i) => ({ px: x(f), py: specY(profile.mean_db[i]) }))))
	const meanArea = $derived(
		`${meanPath}L${x(profile.freqs_hz.at(-1)!).toFixed(1)},${SPECTRUM_H - BOTTOM}L${x(profile.freqs_hz[0]).toFixed(1)},${SPECTRUM_H - BOTTOM}Z`
	)
	const noisePath = $derived(path(profile.freqs_hz.map((f, i) => ({ px: x(f), py: specY(profile.noise_db[i]) }))))
	const thresholdPath = $derived(
		threshold ? path(profile.freqs_hz.map((f, i) => ({ px: x(f), py: specY(threshold[i]) }))) : null
	)
	const responsePath = $derived(path(response.map((p) => ({ px: x(p.f), py: respY(p.db) }))))

	// --- Survol : la bande la plus proche du pointeur, lue sur les deux graphiques ---
	let hover = $state<number | null>(null)

	function onPointer(event: PointerEvent) {
		const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
		const px = event.clientX - box.left
		let best = 0
		for (let i = 1; i < profile.freqs_hz.length; i++) {
			if (Math.abs(x(profile.freqs_hz[i]) - px) < Math.abs(x(profile.freqs_hz[best]) - px)) best = i
		}
		hover = best
	}

	const hovered = $derived.by(() => {
		if (hover === null) return null
		const f = profile.freqs_hz[hover]
		return {
			f,
			px: x(f),
			mean: profile.mean_db[hover],
			noise: profile.noise_db[hover],
			threshold: threshold ? threshold[hover] : null,
			correction: planResponseDb(plan, f)
		}
	})

	const summary = $derived(
		`Spectre de la prise par tiers d'octave, de 20 Hz à 20 kHz, avec le niveau de ses passages les plus calmes. ` +
			(flat ? 'Aucune correction de timbre.' : `Correction de timbre entre ${formatDb(Math.min(...response.map((p) => p.db)), 'dB')} et ${formatDb(Math.max(...response.map((p) => p.db)), 'dB')}.`)
	)
</script>

<div class="chart" bind:clientWidth={width}>
	<ul class="legend" aria-hidden="true">
		<li><span class="key key-mean"></span>Niveau moyen</li>
		<li><span class="key key-noise"></span>Passages les plus calmes</li>
		{#if threshold}<li><span class="key key-threshold"></span>Seuil du débruitage</li>{/if}
	</ul>

	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="plots" onpointermove={onPointer} onpointerdown={onPointer} onpointerleave={() => (hover = null)}>
		<svg {width} height={SPECTRUM_H} role="img" aria-label={summary}>
			<clipPath id="{uid}-spectrum">
				<rect x={LEFT} y={TOP} width={plotW} height={SPECTRUM_H - TOP - BOTTOM} />
			</clipPath>
			{#each specTicks as tick, i (tick)}
				<line class="grid" x1={LEFT} x2={LEFT + plotW} y1={specY(tick)} y2={specY(tick)} />
				<text class="tick" x={LEFT - 6} y={specY(tick)} text-anchor="end" dominant-baseline="middle">
					{signed(tick)}{i === 0 ? ' dB' : ''}
				</text>
			{/each}
			{#each xTicks as tick (tick)}
				<line class="grid" x1={x(tick)} x2={x(tick)} y1={TOP} y2={SPECTRUM_H - BOTTOM} />
			{/each}
			<g clip-path="url(#{uid}-spectrum)">
				<path class="area" d={meanArea} />
				{#if thresholdPath}<path class="line threshold" d={thresholdPath} />{/if}
				<path class="line noise" d={noisePath} />
				<path class="line mean" d={meanPath} />
				{#if hovered}
					<line class="cursor" x1={hovered.px} x2={hovered.px} y1={TOP} y2={SPECTRUM_H - BOTTOM} />
					<circle class="dot noise" cx={hovered.px} cy={specY(hovered.noise)} r="4" />
					<circle class="dot mean" cx={hovered.px} cy={specY(hovered.mean)} r="4" />
				{/if}
			</g>
		</svg>

		<p class="subtitle">Correction appliquée au timbre</p>
		<svg {width} height={RESPONSE_H} aria-hidden="true">
			<clipPath id="{uid}-response">
				<rect x={LEFT} y={TOP - 2} width={plotW} height={RESPONSE_H - TOP - BOTTOM + 4} />
			</clipPath>
			{#each [respSpan, 0, -respSpan] as tick, i (tick)}
				<line class="grid" class:zero={tick === 0} x1={LEFT} x2={LEFT + plotW} y1={respY(tick)} y2={respY(tick)} />
				<text class="tick" x={LEFT - 6} y={respY(tick)} text-anchor="end" dominant-baseline="middle">
					{signed(tick)}{i === 0 ? ' dB' : ''}
				</text>
			{/each}
			{#each xTicks as tick, i (tick)}
				<line class="grid" x1={x(tick)} x2={x(tick)} y1={TOP} y2={RESPONSE_H - BOTTOM} />
				<text class="tick" x={x(tick)} y={RESPONSE_H - 5} text-anchor="middle">
					{tickLabel(tick)}{i === 0 ? ' Hz' : ''}
				</text>
			{/each}
			<g clip-path="url(#{uid}-response)">
				<path class="line response" d={responsePath} />
				{#if hovered}
					<line class="cursor" x1={hovered.px} x2={hovered.px} y1={TOP} y2={RESPONSE_H - BOTTOM} />
					<circle class="dot response" cx={hovered.px} cy={respY(hovered.correction)} r="4" />
				{/if}
			</g>
		</svg>

		{#if hovered}
			<div class="tooltip" class:left={hovered.px > width / 2} style:left="{hovered.px}px">
				<strong>{hz(hovered.f)}</strong>
				<span><span class="key key-mean"></span>Moyen {formatDb(hovered.mean, 'dB')}</span>
				<span><span class="key key-noise"></span>Calme {formatDb(hovered.noise, 'dB')}</span>
				{#if hovered.threshold !== null}
					<span><span class="key key-threshold"></span>Seuil {formatDb(hovered.threshold, 'dB')}</span>
				{/if}
				<span><span class="key key-response"></span>Correction {formatDb(hovered.correction, 'dB')}</span>
			</div>
		{/if}
	</div>
</div>

<style>
	.chart {
		--series-mean: var(--color-blue);
		--series-noise: var(--color-purple);
		--series-response: var(--color-accent);
		display: flex; flex-direction: column; gap: 0.3rem; min-width: 0;
	}
	.plots { position: relative; touch-action: pan-y; }
	svg { display: block; overflow: visible; }

	.legend {
		display: flex; flex-wrap: wrap; gap: 0.2rem 1rem; margin: 0; padding: 0; list-style: none;
		font-size: var(--text-xs); color: var(--color-text-secondary);
	}
	.legend li { display: inline-flex; align-items: center; gap: 0.35rem; }
	.key { display: inline-block; width: 14px; height: 2px; border-radius: 1px; flex-shrink: 0; }
	.key-mean { background: var(--series-mean); }
	.key-noise { background: var(--series-noise); }
	.key-threshold { background: var(--color-text-secondary); height: 1px; }
	.key-response { background: var(--series-response); }

	.subtitle { margin: 0.2rem 0 0; font-size: var(--text-xs); color: var(--color-text-secondary); }

	.grid { stroke: var(--color-border-light); stroke-width: 1; }
	.grid.zero { stroke: var(--color-border); }
	.tick { font-size: var(--text-2xs); fill: var(--color-text-muted); font-variant-numeric: tabular-nums; }
	.line { fill: none; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
	.line.mean { stroke: var(--series-mean); }
	.line.noise { stroke: var(--series-noise); }
	.line.threshold { stroke: var(--color-text-secondary); stroke-width: 1; }
	.line.response { stroke: var(--series-response); }
	.area { fill: var(--series-mean); opacity: 0.1; }
	.cursor { stroke: var(--color-text-muted); stroke-width: 1; }
	.dot { stroke: var(--color-bg); stroke-width: 2; }
	.dot.mean { fill: var(--series-mean); }
	.dot.noise { fill: var(--series-noise); }
	.dot.response { fill: var(--series-response); }

	.tooltip {
		position: absolute; top: 0.4rem; z-index: 1;
		display: flex; flex-direction: column; gap: 0.1rem;
		margin-left: 0.6rem; padding: 0.4rem 0.6rem;
		background: var(--color-bg); border: 1px solid var(--color-border-light);
		border-radius: var(--radius-lg); box-shadow: var(--shadow-popover);
		font-size: var(--text-xs); color: var(--color-text); white-space: nowrap;
		font-variant-numeric: tabular-nums; pointer-events: none;
	}
	.tooltip.left { margin-left: -0.6rem; transform: translateX(-100%); }
	.tooltip span { display: inline-flex; align-items: center; gap: 0.35rem; }
</style>
