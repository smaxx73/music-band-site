<script lang="ts" module>
	export type MenuTriggerProps = {
		onclick: () => void
		'aria-haspopup': 'menu' | 'dialog'
		'aria-expanded': boolean
	}
</script>

<script lang="ts">
	import type { Snippet } from 'svelte'

	/**
	 * Menu déroulant : un bouton, un panneau posé dessous. Le panneau se ferme au clic à
	 * côté et à Échap, qui rend le focus au bouton ; calé à droite du bouton, il passe à
	 * gauche s'il sortait de l'écran, et vient à l'écran s'il naît en bas d'une liste.
	 *
	 * Le bouton est écrit par le parent (`trigger`), qui y étale les attributs reçus : il
	 * garde ainsi ses propres styles. Les entrées portent `.menu-item` (`src/app.css`).
	 * La largeur du panneau se règle par propriétés CSS : `<Menu --menu-min-width="15rem">`
	 * (`--menu-width`, `--menu-min-width`, `--menu-max-width`, `--menu-padding`, `--menu-z`).
	 */
	let {
		open = $bindable(false),
		role = 'menu',
		label,
		scrollIntoView = true,
		class: className = '',
		trigger,
		children
	}: {
		open?: boolean
		/** `dialog` pour un panneau qui n'est pas une liste d'actions (notifications). */
		role?: 'menu' | 'dialog'
		/** Nom du panneau pour les lecteurs d'écran, utile surtout à un `dialog`. */
		label?: string
		/** Faux pour un menu de la barre du haut, qui n'a nulle part où défiler. */
		scrollIntoView?: boolean
		/** Classes globales du conteneur (`row-wide-only`…). */
		class?: string
		trigger: Snippet<[MenuTriggerProps]>
		children: Snippet
	} = $props()

	let root = $state<HTMLElement | null>(null)
	let panel = $state<HTMLElement | null>(null)
	let alignLeft = $state(false)

	// Les écouteurs ne vivent que le temps de l'ouverture : une session affiche des
	// dizaines de prises, chacune avec son menu.
	$effect(() => {
		if (!open) return

		const closeOnOutside = (e: MouseEvent) => {
			if (root && !root.contains(e.target as Node)) open = false
		}
		const closeOnEscape = (e: KeyboardEvent) => {
			if (e.key !== 'Escape') return
			open = false
			root?.querySelector<HTMLElement>(':scope > [aria-haspopup]')?.focus()
		}

		document.addEventListener('click', closeOnOutside)
		document.addEventListener('keydown', closeOnEscape)
		return () => {
			document.removeEventListener('click', closeOnOutside)
			document.removeEventListener('keydown', closeOnEscape)
		}
	})

	$effect(() => {
		if (!open) {
			alignLeft = false
			return
		}
		if (!panel) return
		// Un bouton au bord gauche (en-tête replié sur téléphone) ferait sortir le panneau.
		// Un panneau que son parent a fixé à l'écran (notifications au téléphone) est
		// déjà placé : on n'y touche pas.
		const anchored = getComputedStyle(panel).position === 'absolute'
		if (anchored && panel.getBoundingClientRect().left < 8) alignLeft = true
		if (scrollIntoView) panel.scrollIntoView({ block: 'nearest' })
	})

	const triggerProps = $derived<MenuTriggerProps>({
		onclick: () => (open = !open),
		'aria-haspopup': role,
		'aria-expanded': open
	})
</script>

<div class="menu {className}" bind:this={root}>
	{@render trigger(triggerProps)}

	{#if open}
		<div class="menu-panel" class:align-left={alignLeft} {role} aria-label={label} bind:this={panel}>
			{@render children()}
		</div>
	{/if}
</div>

<style>
	.menu {
		position: relative;
		display: inline-flex;
	}

	.menu-panel {
		position: absolute;
		top: calc(100% + 6px);
		right: 0;
		z-index: var(--menu-z, 40);
		width: var(--menu-width, max-content);
		min-width: var(--menu-min-width, 14rem);
		max-width: var(--menu-max-width, min(20rem, calc(100vw - 1.5rem)));
		display: flex;
		flex-direction: column;
		padding: var(--menu-padding, 0.25rem);
		overflow: hidden;
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-modal);
		text-align: left;
	}

	.menu-panel.align-left {
		right: auto;
		left: 0;
	}
</style>
