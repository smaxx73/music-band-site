<!-- « + Ajouter » : toutes les créations au même endroit — enregistrer, envoyer un fichier,
     créer une session, publier. En tête de la barre latérale sur ordinateur (icône seule
     dans le rail de la tablette), au centre de la barre d'onglets au téléphone, où le
     panneau monte du bas. Les entrées ne font que mener aux pages existantes. -->
<script lang="ts">
	import Menu from '$lib/components/Menu.svelte'
	import Icon from '$lib/components/Icon.svelte'
	import type { IconName } from '$lib/icons'

	let {
		variant,
		hasGroup
	}: {
		/** `sidebar` : bouton plein « + Ajouter » ; `tab` : rond central de la barre d'onglets. */
		variant: 'sidebar' | 'tab'
		/** Sans groupe actif, seules les créations perso ont un sens. */
		hasGroup: boolean
	} = $props()

	let open = $state(false)

	type Item = { href: string; icon: IconName; title: string; hint: string; primary?: boolean }

	// Enregistrer d'abord : c'est le geste de la répétition, téléphone en main.
	const items = $derived<Item[]>([
		{ href: '/record', icon: 'mic', title: 'Enregistrer', hint: 'Micro ou interface audio, classé après coup', primary: true },
		...(hasGroup
			? ([
				{ href: '/upload', icon: 'upload', title: 'Envoyer un fichier', hint: 'Audio, ou vidéo YouTube' },
				{ href: '/sessions?nouvelle', icon: 'calendar', title: 'Nouvelle session', hint: 'Répétition, concert, studio…' },
				{ href: '/fil?publier', icon: 'send', title: 'Publier dans le groupe', hint: 'Enregistrement, vidéo ou suggestion' }
			] satisfies Item[])
			: ([{ href: '/perso', icon: 'upload', title: 'Déposer dans mon espace perso', hint: 'Fichier ou vidéo YouTube' }] satisfies Item[]))
	])
</script>

<Menu
	bind:open
	label="Ajouter"
	scrollIntoView={false}
	class="add-menu add-menu-{variant}"
	--menu-width="19rem"
	--menu-z="110"
>
	{#snippet trigger(menu)}
		<button {...menu} type="button" class="add-trigger add-trigger-{variant}" aria-label={open ? 'Fermer' : 'Ajouter'}>
			<Icon name={variant === 'tab' && open ? 'close' : 'plus'} size={variant === 'tab' ? '1.5rem' : '1rem'} />
			{#if variant === 'sidebar'}<span class="add-label">Ajouter</span>{/if}
		</button>
	{/snippet}

	{#if variant === 'tab'}<p class="add-head">Ajouter</p>{/if}
	{#each items as item (item.href)}
		<a href={item.href} class="menu-item add-item" class:primary={item.primary} role="menuitem" onclick={() => (open = false)}>
			<span class="add-tile"><Icon name={item.icon} size="1.15rem" /></span>
			<span class="menu-item-text">
				<span class="menu-item-title">{item.title}</span>
				<span class="menu-item-hint">{item.hint}</span>
			</span>
		</a>
	{/each}
</Menu>

<style>
	:global(.add-menu-sidebar) { display: flex; width: 100%; }

	.add-trigger {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		border: none;
		background: var(--color-accent);
		color: #fff;
		font: inherit;
		cursor: pointer;
	}

	.add-trigger:hover { filter: brightness(1.06); }

	/* L'icône change (+ → ×) au clic qui ouvre : si elle était la cible du clic, celle-ci
	   aurait quitté la page quand Menu vérifie que le clic vient de chez lui, et le menu
	   se refermerait aussitôt. La cible est donc toujours le bouton. */
	.add-trigger :global(svg) { pointer-events: none; }

	.add-trigger-sidebar {
		width: 100%;
		min-height: 36px;
		border-radius: var(--radius-lg);
		font-size: var(--text-sm);
		font-weight: 600;
	}

	/* Le rond central de la barre d'onglets : l'action principale de l'écran. Ouvert, il
	   devient la croix qui referme, sur fond clair pour se détacher du voile. */
	.add-trigger-tab {
		width: 52px;
		height: 52px;
		border-radius: 50%;
		box-shadow: 0 4px 12px rgba(226, 94, 54, 0.35);
	}

	.add-trigger-tab[aria-expanded='true'] {
		background: var(--color-bg);
		color: var(--color-ink);
		box-shadow: none;
	}

	.add-item { align-items: center; gap: 0.75rem; }

	/* `.menu-item:has(.menu-item-text)` aligne en haut et décale l'icône : la tuile, elle,
	   se centre sur les deux lignes. */
	.add-item :global(svg) { margin-top: 0; color: inherit; }

	.add-tile {
		width: 36px;
		height: 36px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-xl);
		background: var(--color-bg-muted);
		color: var(--color-text);
	}

	.add-item.primary .add-tile {
		background: var(--color-accent);
		color: #fff;
	}

	.add-head {
		margin: 0 0 0.25rem;
		padding: 0 0.6rem;
		font-size: var(--text-lg);
		font-weight: 700;
	}

	/* Au téléphone, le panneau monte du bas, au-dessus de la barre d'onglets, et voile la
	   page derrière lui (l'ombre étendue tient lieu de fond, sans élément de plus). */
	:global(.add-menu-tab .menu-panel) {
		position: fixed;
		top: auto;
		left: 0;
		right: 0;
		bottom: var(--footer-actions-h);
		width: auto;
		max-width: none;
		padding: 0.9rem 0.75rem 0.75rem;
		border: none;
		border-radius: calc(var(--radius-xl) * 2) calc(var(--radius-xl) * 2) 0 0;
		box-shadow: 0 0 0 100vmax rgba(0, 0, 0, 0.45);
	}

	:global(.add-menu-tab) .add-item { min-height: 60px; }
	:global(.add-menu-tab) .add-tile { width: 44px; height: 44px; border-radius: var(--radius-xl); }
	:global(.add-menu-tab) .menu-item-title { font-size: var(--text-base); }
</style>
