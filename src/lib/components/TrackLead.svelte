<script lang="ts">
	import Icon from '$lib/components/Icon.svelte'

	// Colonne de tête d'une piste (ligne de prise, ligne de playlist) : le numéro au
	// repos, ▶ au survol de la ligne (souris seulement), un égaliseur sur la piste qui
	// joue. La ligne qui l'accueille porte la classe `track-row`, cible du survol.
	let {
		number,
		current = false,
		playing = false,
		playLabel = null,
		onToggle = null
	}: {
		number: number
		current?: boolean
		playing?: boolean
		/** Sans intitulé ni action, pas de ▶ : une prise vidéo seule ne se lit pas ici. */
		playLabel?: string | null
		onToggle?: (() => void) | null
	} = $props()
</script>

<div class="track-lead" class:current class:playing class:can-play={!!onToggle}>
	<span class="lead-num">{number}</span>
	<span class="lead-eq" aria-hidden="true"><i></i><i></i><i></i></span>
	{#if onToggle}
		<button
			class="lead-play"
			onclick={onToggle}
			title={playing ? 'Mettre en pause' : 'Écouter'}
			aria-label={playing ? 'Mettre en pause' : (playLabel ?? 'Écouter')}
		><Icon name={playing ? 'pause' : 'play'} size="0.95rem" /></button>
	{/if}
</div>

<style>
	.track-lead {
		position: relative;
		width: 2rem;
		height: 2rem;
		display: grid;
		place-items: center;
	}

	.lead-num {
		font-weight: 600;
		color: var(--color-text-muted);
		font-variant-numeric: tabular-nums;
	}

	.lead-eq {
		display: none;
		align-items: flex-end;
		gap: 2px;
		height: 14px;
	}

	.lead-eq i {
		width: 3px;
		height: 100%;
		background: var(--color-accent);
		border-radius: 1px;
		transform-origin: bottom;
		transform: scaleY(0.35);
	}

	.current .lead-num { display: none; }
	.current .lead-eq { display: flex; }

	/* En pause, l'égaliseur se fige : la piste reste la courante, elle ne joue plus. */
	.playing .lead-eq i { animation: eq 0.9s ease-in-out infinite; }
	.playing .lead-eq i:nth-child(2) { animation-duration: 0.7s; animation-delay: -0.3s; }
	.playing .lead-eq i:nth-child(3) { animation-duration: 1.1s; animation-delay: -0.5s; }

	@keyframes eq {
		0%, 100% { transform: scaleY(0.3); }
		50% { transform: scaleY(1); }
	}

	@media (prefers-reduced-motion: reduce) {
		.playing .lead-eq i { animation: none; transform: scaleY(0.8); }
	}

	.lead-play {
		position: absolute;
		inset: 0;
		display: none;
		place-items: center;
		border: none;
		border-radius: 50%;
		background: none;
		color: var(--color-text);
		cursor: pointer;
	}

	.lead-play:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 1px; }

	/* Souris seulement : au doigt, il n'y a pas de survol — un :hover collant y
	   demanderait deux touchers pour lancer la lecture —, donc le numéro reste un numéro
	   et la ligne garde son vrai bouton ▶. Le ▶ de tête reste dans l'arbre, transparent :
	   le clavier l'atteint toujours. */
	@media (hover: hover) and (pointer: fine) {
		.can-play .lead-play { display: grid; opacity: 0; }
		:global(.track-row:hover) .can-play .lead-play,
		.lead-play:focus-visible { opacity: 1; }
		:global(.track-row:hover) .can-play .lead-num,
		:global(.track-row:hover) .can-play .lead-eq,
		.can-play:has(.lead-play:focus-visible) .lead-num,
		.can-play:has(.lead-play:focus-visible) .lead-eq { visibility: hidden; }
	}
</style>
