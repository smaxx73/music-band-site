<script lang="ts">
	import type { Metronome } from '$lib/metronome.svelte'

	/**
	 * Clic au tempo du morceau, et son témoin lumineux : la feuille de répétition (lecture
	 * et pupitre). Au repos, un seul bouton ; le réglage du tempo n'apparaît qu'en jouant,
	 * pour ne pas charger une barre déjà pleine. Le moteur vient de la page, qui le garde
	 * d'une vue à l'autre : ouvrir le pupitre ne coupe pas le clic.
	 */
	let { metronome, small = false }: { metronome: Metronome; small?: boolean } = $props()
</script>

<div class="metronome" role="group" aria-label="Clic au tempo">
	<button
		class="btn btn-secondary metro-toggle"
		class:btn-sm={small}
		onclick={() => metronome.toggle()}
		aria-pressed={metronome.running}
		title={metronome.running ? 'Arrêter le clic' : `Lancer un clic à ${metronome.bpm} battements par minute`}
	>
		<span class="metro-light" class:on={metronome.running} class:lit={metronome.lit} aria-hidden="true"></span>
		Clic <span class="metro-bpm">{metronome.bpm}</span>&nbsp;BPM
	</button>
	{#if metronome.running}
		<button class="btn btn-secondary metro-step" class:btn-sm={small} onclick={() => metronome.nudge(-1)} aria-label="Ralentir le clic" title="Plus lent">−</button>
		<button class="btn btn-secondary metro-step" class:btn-sm={small} onclick={() => metronome.nudge(1)} aria-label="Accélérer le clic" title="Plus vite">+</button>
		{#if metronome.bpm !== metronome.reference}
			<!-- Le groupe joue rarement au tempo exact de la fiche : on s'en écarte en jouant,
			     sans toucher à la fiche, et on y revient d'un toucher. -->
			<button class="btn-link-muted metro-reset" onclick={() => metronome.reset()} title="Revenir au tempo du morceau">
				↺ {metronome.reference}
			</button>
		{/if}
	{/if}
</div>

<style>
	.metronome { display: inline-flex; align-items: center; gap: .3rem; }

	.metro-toggle { gap: .45rem; }
	.metro-toggle[aria-pressed='true'] { border-color: var(--color-accent); color: var(--color-accent-dark); background: var(--color-accent-light); }
	.metro-bpm { font-variant-numeric: tabular-nums; min-width: 3ch; text-align: right; }

	/* Le témoin : éteint au repos, braise entre deux battements, éclair sur le battement.
	   Pas de transition à l'allumage — un éclair adouci arriverait après le clic. */
	.metro-light {
		width: .75em;
		height: .75em;
		flex: none;
		border-radius: 50%;
		border: 1.5px solid currentColor;
		opacity: .45;
	}
	.metro-light.on { border-color: var(--color-accent); background: var(--color-accent-light); opacity: 1; }
	.metro-light.lit { background: var(--color-accent); transform: scale(1.35); box-shadow: 0 0 0 .2em var(--color-accent-light); }

	.metro-step { min-width: 2.2rem; justify-content: center; font-variant-numeric: tabular-nums; }
	.metro-reset { font-size: var(--text-sm); white-space: nowrap; }

	@media (prefers-reduced-motion: reduce) {
		.metro-light.lit { transform: none; }
	}
</style>
