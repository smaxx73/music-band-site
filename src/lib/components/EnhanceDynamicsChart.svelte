<script lang="ts">
	import { formatDb, type AudioProfile, type EnhancePlan } from '$lib/audio-enhance'
	import { compressorOutDb } from '$lib/audio-enhance-curves'

	/**
	 * La compression en deux graphiques qui partagent l'axe du niveau d'entrée : la courbe
	 * du compresseur (ce qui sort pour ce qui entre), et sous elle le temps que la prise
	 * passe à chaque niveau, une fois le gain d'entrée appliqué. Lus ensemble, ils disent
	 * quelle part de la musique dépasse le seuil — donc ce que le compresseur tient.
	 */
	let {
		profile,
		compressor,
		preGainDb
	}: {
		profile: AudioProfile
		compressor: NonNullable<EnhancePlan['compressor']>
		preGainDb: number
	} = $props()

	const IN_MIN = -60
	const IN_MAX = 0
	const LEFT = 48
	const RIGHT = 10
	const LEVELS_H = 74
	const TOP = 8
	const BOTTOM = 20

	let width = $state(340)
	const plotW = $derived(Math.max(120, width - LEFT - RIGHT))
	// Tracé carré : entrée et sortie à la même échelle, la droite « sans compression »
	// est une vraie diagonale et la pente de la courbe se lit comme un taux.
	const CURVE_H = $derived(plotW + TOP + BOTTOM)
	const x = (db: number) => LEFT + ((db - IN_MIN) / (IN_MAX - IN_MIN)) * plotW
	const y = (db: number) => TOP + ((IN_MAX - db) / (IN_MAX - IN_MIN)) * plotW
	const TICKS = [-60, -40, -20, 0]
	const minus = (db: number) => (db < 0 ? `−${-db}` : String(db))

	const curvePath = $derived(
		Array.from({ length: IN_MAX - IN_MIN + 1 }, (_, i) => {
			const db = IN_MIN + i
			return `${i ? 'L' : 'M'}${x(db).toFixed(1)},${y(compressorOutDb(db, compressor)).toFixed(1)}`
		}).join('')
	)

	/** Le temps passé à chaque niveau, décalé du gain d'entrée : ce que voit le compresseur. */
	const levels = $derived(
		profile.levels
			.map((share, i) => ({ db: profile.levels_from_db + i + preGainDb, share }))
			.filter((l) => l.db >= IN_MIN && l.db <= IN_MAX && l.share > 0)
	)
	const maxShare = $derived(Math.max(0.0001, ...levels.map((l) => l.share)))
	const barW = $derived(Math.max(1, Math.min(24, plotW / (IN_MAX - IN_MIN) - 2)))
	const barH = (share: number) => (share / maxShare) * (LEVELS_H - TOP - BOTTOM)

	const aboveThreshold = $derived(
		levels.filter((l) => l.db >= compressor.threshold_db).reduce((sum, l) => sum + l.share, 0)
	)
	const percent = (share: number) =>
		share > 0 && share < 0.01 ? 'moins de 1 %' : `${Math.round(share * 100)} %`

	// --- Survol : un niveau d'entrée, lu sur les deux graphiques ---
	let hover = $state<number | null>(null)

	function onPointer(event: PointerEvent) {
		const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
		const db = IN_MIN + ((event.clientX - box.left - LEFT) / plotW) * (IN_MAX - IN_MIN)
		hover = Math.round(Math.min(IN_MAX, Math.max(IN_MIN, db)))
	}

	const hovered = $derived.by(() => {
		if (hover === null) return null
		const out = compressorOutDb(hover, compressor)
		const share = levels.find((l) => Math.round(l.db) === hover)?.share ?? 0
		return { db: hover, out, share, px: x(hover) }
	})

	const summary = $derived(
		`Courbe du compresseur : ${compressor.ratio.toLocaleString('fr-FR')}:1 au-dessus de ${formatDb(compressor.threshold_db, 'dB')}. ` +
			`La prise passe ${percent(aboveThreshold)} du temps au-dessus du seuil.`
	)
</script>

<div class="chart">
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="plots" bind:clientWidth={width} onpointermove={onPointer} onpointerdown={onPointer} onpointerleave={() => (hover = null)}>
		<p class="subtitle">Niveau de sortie selon le niveau d'entrée</p>
		<svg {width} height={CURVE_H} role="img" aria-label={summary}>
			{#each TICKS as tick (tick)}
				<line class="grid" x1={LEFT} x2={LEFT + plotW} y1={y(tick)} y2={y(tick)} />
				<line class="grid" x1={x(tick)} x2={x(tick)} y1={TOP} y2={CURVE_H - BOTTOM} />
				<text class="tick" x={LEFT - 6} y={y(tick)} text-anchor="end" dominant-baseline="middle">
					{minus(tick)}{tick === IN_MAX ? ' dB' : ''}
				</text>
			{/each}
			<!-- Sans compression : ce qui entre sort tel quel. La courbe s'en écarte au seuil. -->
			<line class="identity" x1={x(IN_MIN)} y1={y(IN_MIN)} x2={x(IN_MAX)} y2={y(IN_MAX)} />
			<line class="threshold" x1={x(compressor.threshold_db)} x2={x(compressor.threshold_db)} y1={TOP} y2={CURVE_H - BOTTOM} />
			<text
				class="tick label"
				x={x(compressor.threshold_db) - 5}
				y={TOP + 8}
				text-anchor="end"
			>seuil</text>
			<path class="line" d={curvePath} />
			{#if hovered}
				<line class="cursor" x1={hovered.px} x2={hovered.px} y1={TOP} y2={CURVE_H - BOTTOM} />
				<circle class="dot" cx={hovered.px} cy={y(hovered.out)} r="4" />
			{/if}
		</svg>

		<p class="subtitle">Temps passé à chaque niveau, après le gain d'entrée</p>
		<svg {width} height={LEVELS_H} aria-hidden="true">
			<line class="grid base" x1={LEFT} x2={LEFT + plotW} y1={LEVELS_H - BOTTOM} y2={LEVELS_H - BOTTOM} />
			{#each levels as level (level.db)}
				<rect
					class="bar"
					class:held={level.db >= compressor.threshold_db}
					x={x(level.db) - barW / 2}
					y={LEVELS_H - BOTTOM - barH(level.share)}
					width={barW}
					height={barH(level.share)}
				/>
			{/each}
			<line class="threshold" x1={x(compressor.threshold_db)} x2={x(compressor.threshold_db)} y1={TOP} y2={LEVELS_H - BOTTOM} />
			{#each TICKS as tick (tick)}
				<text class="tick" x={x(tick)} y={LEVELS_H - 5} text-anchor={tick === IN_MAX ? 'end' : 'middle'}>{minus(tick)}</text>
			{/each}
			{#if hovered}
				<line class="cursor" x1={hovered.px} x2={hovered.px} y1={TOP} y2={LEVELS_H - BOTTOM} />
			{/if}
		</svg>

		{#if hovered}
			<div class="tooltip" class:left={hovered.px > width / 2} style:left="{hovered.px}px">
				<strong>Entrée {formatDb(hovered.db, 'dB')}</strong>
				<span>Sortie {formatDb(hovered.out, 'dB')}</span>
				<span>Retenu {formatDb(Math.min(0, hovered.out - hovered.db), 'dB')}</span>
				<span>{percent(hovered.share)} du temps à ce niveau</span>
			</div>
		{/if}
	</div>
	<p class="caption">
		La prise passe <strong>{percent(aboveThreshold)}</strong> du temps au-dessus du seuil : c'est là
		que le compresseur travaille.
	</p>
</div>

<style>
	.chart { display: flex; flex-wrap: wrap; align-items: center; gap: 0.3rem 1.25rem; min-width: 0; }
	.plots { position: relative; touch-action: pan-y; flex: 0 1 340px; min-width: 0; }
	.caption { flex: 1 1 12rem; }
	svg { display: block; overflow: visible; }
	.subtitle { margin: 0.2rem 0 0; font-size: var(--text-xs); color: var(--color-text-secondary); }
	.caption { margin: 0; font-size: var(--text-xs); color: var(--color-text-secondary); }

	.grid { stroke: var(--color-border-light); stroke-width: 1; }
	.grid.base { stroke: var(--color-border); }
	.tick { font-size: var(--text-2xs); fill: var(--color-text-muted); font-variant-numeric: tabular-nums; }
	.tick.label { fill: var(--color-text-secondary); }
	.identity { stroke: var(--color-border); stroke-width: 1; }
	.threshold { stroke: var(--color-text-secondary); stroke-width: 1; }
	.line { fill: none; stroke: var(--color-accent); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
	.cursor { stroke: var(--color-text-muted); stroke-width: 1; }
	.dot { fill: var(--color-accent); stroke: var(--color-bg); stroke-width: 2; }
	/* Une seule série, donc une seule teinte : ce qui dépasse le seuil est seulement plus dense. */
	.bar { fill: var(--color-blue); opacity: 0.35; }
	.bar.held { opacity: 1; }

	.tooltip {
		position: absolute; top: 1.6rem; z-index: 1;
		display: flex; flex-direction: column; gap: 0.1rem;
		margin-left: 0.6rem; padding: 0.4rem 0.6rem;
		background: var(--color-bg); border: 1px solid var(--color-border-light);
		border-radius: var(--radius-lg); box-shadow: var(--shadow-popover);
		font-size: var(--text-xs); color: var(--color-text); white-space: nowrap;
		font-variant-numeric: tabular-nums; pointer-events: none;
	}
	.tooltip.left { margin-left: -0.6rem; transform: translateX(-100%); }
</style>
