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
		neutral = 'ink',
		photo = null,
		photoVeil = 75,
		headingLevel = 1,
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
		 * Sans teinte, le bandeau suit `neutral`.
		 */
		hue?: number | null
		/**
		 * Bandeau sans teinte. `ink` (encre, texte clair) pour les pages qui rassemblent
		 * des morceaux (référentiel, playlist) ; `stone` (gris clair) pour une session
		 * « Autre », qui reste ainsi dans la famille claire des bandeaux de session.
		 */
		neutral?: 'ink' | 'stone'
		/**
		 * Photo posée en fond du bandeau (session) : recadrée au centre à la taille réelle
		 * du bandeau, sous un voile sombre qui passe le texte en clair. Prend le pas sur
		 * la teinte.
		 */
		photo?: string | null
		/** Opacité du voile au bord gauche, en % (voir `SESSION_PHOTO_VEIL`). */
		photoVeil?: number
		/** Niveau du titre : h1 sur une page, plus bas dans une liste de cartes. */
		headingLevel?: 1 | 2 | 3 | 4
		children?: Snippet
		actions?: Snippet
	} = $props()
</script>

<!-- Le cadre est le conteneur, l'en-tête sa grille : une requête de conteneur ne
     s'applique jamais au conteneur lui-même. La disposition suit la largeur de l'en-tête,
     pas celle de la fenêtre — la colonne de contenu perd déjà 188 px de sidebar. -->
<div class="mh-frame">
	<header
		class="media-header"
		class:tinted={hue !== null && !photo}
		class:ink={hue === null && !photo && neutral === 'ink'}
		class:photo={!!photo}
		style={photo
			? `--mh-photo: url("${photo}"); --mh-veil: ${photoVeil / 100}`
			: hue !== null ? `--hue: ${hue}` : undefined}
	>
		<div class="mh-cover">{@render cover()}</div>
		<div class="mh-id">
			<div class="mh-kicker">{@render kicker()}</div>
			<svelte:element this={`h${headingLevel}`}>{title}</svelte:element>
		</div>
		{#if children}<div class="mh-body">{@render children()}</div>{/if}
		{#if stats}<p class="mh-stats">{stats}</p>{/if}
		<!-- À droite, calées sur la ligne des chiffres : centrées sur la hauteur du visuel,
		     elles flottaient. Le ▶ ferme la rangée au bord droit, comme dans l'en-tête d'un
		     morceau au sein d'une session ; les commandes secondaires le précèdent. -->
		{#if actions}
			<div class="mh-actions">{@render actions()}</div>
		{/if}
	</header>
</div>

<style>
	.mh-frame {
		container-type: inline-size;
		margin-bottom: 1.5rem;
	}

	/* Un bandeau plus foncé que le corps de la page, pour que l'en-tête s'en détache.
	   Teinté comme son visuel : la page d'un morceau prend la couleur de sa pochette,
	   une session celle de son type. Tons assez clairs pour garder le texte sombre.
	   Sans teinte, un gris clair (`stone`) — ou l'encre, voir `.ink`.
	   Large : le texte, centré sur la hauteur du visuel, entre lui et les commandes. */
	.media-header {
		--mh-bg: linear-gradient(135deg, #ECEBE9, #DBD9D7);
		--mh-ink-soft: #55534E;
		display: grid;
		grid-template-columns: 104px minmax(0, 1fr) auto;
		grid-template-rows: 1fr auto auto auto 1fr;
		grid-template-areas:
			'cover .     actions'
			'cover id    actions'
			'cover body  actions'
			'cover stats actions'
			'cover .     actions';
		column-gap: 1.1rem;
		padding: 1.1rem 1.25rem;
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

	.media-header.photo :is(h1, h2, h3, h4) { text-shadow: 0 1px 3px rgba(0, 0, 0, 0.35); }

	/* Référentiel, playlist : la couleur de la barre latérale. Ces pages n'ont pas de
	   teinte propre, et un bandeau sombre les distingue des pages d'un morceau ou d'une
	   session, toujours claires. */
	.media-header.ink {
		--mh-bg: linear-gradient(135deg, var(--color-primary-hover), var(--color-ink));
		--mh-ink-soft: rgba(245, 243, 238, 0.78);
		color: var(--color-paper);
	}

	/* Le bouton principal est à l'encre : sur l'encre, il passe au papier. */
	.ink .mh-actions :global(.btn-primary) {
		background: var(--color-paper);
		border-color: var(--color-paper);
		color: var(--color-ink);
	}

	.ink .mh-actions :global(.btn-primary:hover:not(:disabled)) {
		background: var(--color-bg-muted);
		border-color: var(--color-bg-muted);
	}

	.mh-cover {
		grid-area: cover;
		align-self: center;
		width: 104px;
		height: 104px;
		flex-shrink: 0;
		border-radius: var(--radius-xl);
		overflow: hidden;
		box-shadow: var(--shadow-popover);
	}

	.mh-id {
		grid-area: id;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.mh-body {
		grid-area: body;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		margin-top: 0.15rem;
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
	.mh-body :global(p) { color: var(--mh-ink-soft); }

	:is(h1, h2, h3, h4) {
		margin: 0;
		font-size: var(--text-xl);
		line-height: 1.2;
		text-wrap: balance;
		overflow-wrap: anywhere;
	}

	.mh-stats {
		grid-area: stats;
		margin: 0.2rem 0 0;
		font-size: var(--text-sm);
		color: var(--mh-ink-soft);
		font-variant-numeric: tabular-nums;
	}

	.mh-actions {
		grid-area: actions;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		align-self: end;
	}

	.mh-actions :global(.btn) { gap: 0.4rem; }

	/* Commandes secondaires : sans cadre, à la hauteur du texte qui suit le ▶. */
	.mh-actions :global(.mh-secondary) { color: var(--mh-ink-soft); }

	/* Le survol du corps de page (`--color-bg-muted`) disparaîtrait sur le bandeau. */
	.mh-actions :global(.mh-secondary:hover:not(:disabled)) {
		color: var(--color-text);
		background: rgba(44, 43, 40, 0.08);
	}

	.photo .mh-actions :global(.mh-secondary:hover:not(:disabled)),
	.ink .mh-actions :global(.mh-secondary:hover:not(:disabled)) {
		color: #fff;
		background: rgba(255, 255, 255, 0.16);
	}

	/* Largeur moyenne : les commandes secondaires se réduisent à leur icône (libellé
	   gardé pour les lecteurs d'écran) avant que le texte ne soit écrasé. */
	@container (max-width: 720px) {
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
	}

	/* Étroit : garder les commandes à côté du texte le réduisait à une colonne où le
	   titre se coupait au milieu des mots. Le visuel ouvre l'en-tête avec le titre et
	   les chiffres, les détails prennent toute la largeur, et les commandes leur propre
	   rangée, calées à droite comme le ▶ l'est partout. */
	@container (max-width: 540px) {
		.media-header {
			grid-template-columns: 64px minmax(0, 1fr);
			grid-template-rows: none;
			grid-template-areas:
				'cover id'
				'cover stats'
				'body  body'
				'actions actions';
			column-gap: 0.75rem;
			padding: 0.8rem 0.85rem;
		}
		.mh-cover { width: 64px; height: 64px; border-radius: var(--radius-lg); }
		.mh-id { align-self: end; }
		.mh-stats { align-self: start; margin-top: 0.1rem; font-size: var(--text-xs); }
		.mh-body { margin-top: 0.55rem; }
		.mh-actions { justify-self: end; margin-top: 0.4rem; }
		:is(h1, h2, h3, h4) { font-size: var(--text-lg); }
	}

	@media (max-width: 640px) {
		.mh-frame { margin-bottom: 1rem; }
	}
</style>
