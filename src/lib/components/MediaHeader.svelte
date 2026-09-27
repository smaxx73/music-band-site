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
		hue = null,
		photo = null,
		photoVeil = 75,
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
		/**
		 * Teinte du bandeau (0–360), celle du visuel : un morceau, un type de session.
		 * Sans teinte, un beige chaud neutre (playlist, référentiel).
		 */
		hue?: number | null
		/**
		 * Photo posée en fond du bandeau (session) : recadrée au centre à la taille réelle
		 * du bandeau, sous un voile sombre qui passe le texte en clair. Prend le pas sur
		 * la teinte.
		 */
		photo?: string | null
		/** Opacité du voile au bord gauche, en % (voir `SESSION_PHOTO_VEIL`). */
		photoVeil?: number
		children?: Snippet
		actions?: Snippet
	} = $props()
</script>

<header
	class="media-header"
	class:tinted={hue !== null && !photo}
	class:photo={!!photo}
	style={photo
		? `--mh-photo: url("${photo}"); --mh-veil: ${photoVeil / 100}`
		: hue !== null ? `--hue: ${hue}` : undefined}
>
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
	/* Un bandeau plus foncé que le corps de la page, pour que l'en-tête s'en détache.
	   Teinté comme son visuel : la page d'un morceau prend la couleur de sa pochette,
	   une session celle de son type. Tons assez clairs pour garder le texte sombre. */
	.media-header {
		--mh-bg: linear-gradient(135deg, #EEE9DF, #E1D9C9);
		--mh-ink-soft: #57524B;
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.9rem 1.1rem;
		padding: 1.1rem 1.25rem;
		margin-bottom: 1.5rem;
		border-radius: var(--radius-xl);
		background: var(--mh-bg);
	}

	.media-header.tinted {
		--mh-bg: linear-gradient(135deg, hsl(var(--hue) 38% 91%), hsl(var(--hue) 30% 83%));
		--mh-ink-soft: hsl(var(--hue) 12% 32%);
	}

	/* Une photo n'a pas de ton garanti : le voile, plus dense à gauche où se lit le
	   texte, assure le contraste quelle que soit l'image. Le texte passe en clair.
	   Son intensité se règle par session ; la droite garde la même proportion. */
	.media-header.photo {
		--mh-bg:
			linear-gradient(
				90deg,
				rgba(24, 21, 18, var(--mh-veil)),
				rgba(24, 21, 18, calc(var(--mh-veil) * 0.68)) 60%,
				rgba(24, 21, 18, calc(var(--mh-veil) * 0.57))
			),
			var(--mh-photo) center / cover no-repeat,
			#3b3833;
		--mh-ink-soft: rgba(255, 255, 255, 0.84);
		color: #fff;
	}

	.media-header.photo h1 { text-shadow: 0 1px 3px rgba(0, 0, 0, 0.35); }

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
		color: var(--mh-ink-soft);
	}

	/* Le texte secondaire des pages (compositeur, lieu, description) suit le bandeau :
	   le gris du corps de page y manquerait de contraste. */
	.mh-text :global(p) { color: var(--mh-ink-soft); }

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
		color: var(--mh-ink-soft);
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
	.mh-actions :global(.mh-secondary) { color: var(--mh-ink-soft); }

	/* Le survol du corps de page (`--color-bg-muted`) disparaîtrait sur le bandeau. */
	.mh-actions :global(.mh-secondary:hover:not(:disabled)) {
		color: var(--color-text);
		background: rgba(44, 43, 40, 0.08);
	}

	.photo .mh-actions :global(.mh-secondary:hover:not(:disabled)) {
		color: #fff;
		background: rgba(255, 255, 255, 0.16);
	}

	/* Au téléphone, l'en-tête tient sur une rangée : les commandes secondaires se
	   réduisent à leur icône (libellé gardé pour les lecteurs d'écran), et le texte
	   cède la largeur au lieu de renvoyer les boutons à la ligne. */
	@media (max-width: 640px) {
		.media-header { gap: 0.5rem 0.75rem; padding: 0.8rem 0.85rem; margin-bottom: 1rem; }
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
