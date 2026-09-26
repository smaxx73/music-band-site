<script lang="ts">
	import type { Snippet } from 'svelte'

	// En-tête des pages qui listent des prises (session, morceau, playlist) : la même
	// grammaire que l'en-tête « album » d'un morceau dans une session, à l'échelle de
	// la page. Visuel carré, nature de la page, titre, ce qu'elle contient, et le ▶.
	let {
		title,
		kicker,
		cover,
		stats = null,
		children,
		actions
	}: {
		title: string
		/** Ce qu'est la page (« Morceau », « Playlist », type de session). */
		kicker: Snippet
		/** Rendu dans un carré : le visuel le remplit. */
		cover: Snippet
		/** « 12 prises · 47 min » : ce que la page contient, en chiffres alignés. */
		stats?: string | null
		children?: Snippet
		actions?: Snippet
	} = $props()
</script>

<header class="media-header">
	<div class="mh-cover">{@render cover()}</div>
	<div class="mh-text">
		<div class="mh-kicker">{@render kicker()}</div>
		<h1>{title}</h1>
		{@render children?.()}
		{#if stats}<p class="mh-stats">{stats}</p>{/if}
	</div>
	<!-- À droite, calées sur la ligne des chiffres : centrées sur la hauteur du visuel,
	     elles flottaient. Le ▶ ferme la rangée au bord droit, comme dans l'en-tête d'un
	     morceau au sein d'une session ; les commandes secondaires le précèdent. -->
	{#if actions}
		<div class="mh-actions">{@render actions()}</div>
	{/if}
</header>

<style>
	.media-header {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.9rem 1.1rem;
		margin-bottom: 1.5rem;
	}

	.mh-cover {
		width: 104px;
		height: 104px;
		flex-shrink: 0;
		border-radius: var(--radius-xl);
		overflow: hidden;
		box-shadow: 0 2px 10px rgba(44, 43, 40, 0.16);
	}

	.mh-text {
		flex: 1 1 12rem;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	/* Même libellé que l'en-tête d'un morceau dans une session (`.song-kicker`). */
	.mh-kicker {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.4rem;
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--color-text-muted);
	}

	h1 {
		margin: 0;
		font-size: var(--text-xl);
		line-height: 1.2;
		text-wrap: balance;
		overflow-wrap: anywhere;
	}

	.mh-stats {
		margin: 0.2rem 0 0;
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		font-variant-numeric: tabular-nums;
	}

	.mh-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		align-self: flex-end;
		margin-left: auto;
	}

	.mh-actions :global(.btn) { gap: 0.4rem; }

	/* Commandes secondaires : sans cadre, à la hauteur du texte qui suit le ▶. */
	.mh-actions :global(.mh-secondary) { color: var(--color-text-secondary); }

	.mh-actions :global(.mh-secondary:hover:not(:disabled)) { color: var(--color-text); }

	/* Au téléphone, l'en-tête tient sur une rangée : les commandes secondaires se
	   réduisent à leur icône (libellé gardé pour les lecteurs d'écran), et le texte
	   cède la largeur au lieu de renvoyer les boutons à la ligne. */
	@media (max-width: 640px) {
		.media-header { gap: 0.5rem 0.75rem; margin-bottom: 1rem; }
		.mh-cover { width: 64px; height: 64px; border-radius: var(--radius-lg); }
		.mh-text { flex: 1 1 0; }
		.mh-actions { gap: 0.15rem; }
		.mh-actions :global(.btn) { min-height: 44px; min-width: 44px; }
		.mh-actions :global(.mh-label) {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip: rect(0 0 0 0);
			white-space: nowrap;
		}
		h1 { font-size: 1.2rem; }
		.mh-stats { margin-top: 0.1rem; font-size: var(--text-xs); }
	}
</style>
