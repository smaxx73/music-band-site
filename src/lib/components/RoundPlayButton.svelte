<script lang="ts">
	import Icon from '$lib/components/Icon.svelte'

	// Le gros ▶ orange des en-têtes : pur affichage, chaque page décide de ce qu'il lance
	// (le mini-lecteur pour une session ou un morceau, son propre lecteur pour une playlist).
	let { playing, label, onclick }: { playing: boolean; label: string; onclick: () => void } = $props()
</script>

<button
	class="round-play"
	{onclick}
	title={playing ? 'Mettre en pause' : label}
	aria-label={playing ? 'Mettre en pause' : label}
>
	<Icon name={playing ? 'pause' : 'play'} size="1.05rem" />
</button>

<style>
	.round-play {
		width: 44px;
		height: 44px;
		flex-shrink: 0;
		display: grid;
		place-items: center;
		border: none;
		border-radius: 50%;
		background: var(--color-accent);
		color: #fff;
		cursor: pointer;
		box-shadow: 0 2px 8px rgba(226, 94, 54, 0.35);
		transition: transform 0.12s, filter 0.12s;
	}

	.round-play:hover { transform: scale(1.05); filter: brightness(1.05); }

	.round-play:focus-visible {
		outline: 2px solid var(--color-ink);
		outline-offset: 2px;
	}

	@media (prefers-reduced-motion: reduce) {
		.round-play { transition: none; }
		.round-play:hover { transform: none; }
	}
</style>
