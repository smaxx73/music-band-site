<script lang="ts" module>
	export type MenuTriggerProps = {
		onclick: () => void
		'aria-haspopup': 'menu' | 'dialog'
		'aria-expanded': boolean
	}
</script>

<script lang="ts">
	import type { Snippet } from 'svelte'
	import { cubicOut } from 'svelte/easing'

	/**
	 * Menu déroulant : un bouton, un panneau posé dessous. Le panneau se ferme au clic à
	 * côté et à Échap, qui rend le focus au bouton ; calé à droite du bouton, il passe à
	 * gauche s'il sortait de l'écran, et vient à l'écran s'il naît en bas d'une liste.
	 *
	 * Le bouton est écrit par le parent (`trigger`), qui y étale les attributs reçus : il
	 * garde ainsi ses propres styles. Les entrées portent `.menu-item` (`src/app.css`).
	 * La largeur du panneau se règle par propriétés CSS : `<Menu --menu-min-width="15rem">`
	 * (`--menu-width`, `--menu-min-width`, `--menu-max-width`, `--menu-padding`, `--menu-z`),
	 * et son apparition par `--menu-enter-y`, le décalage en px d'où il glisse.
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
			if (!root || root.contains(e.target as Node)) return
			open = false
			// Un panneau fixé à l'écran (« + Ajouter », notifications au téléphone) voile la
			// page : toucher le voile referme, et ne doit pas activer le lien caché dessous.
			if (panel && getComputedStyle(panel).position === 'fixed') {
				e.preventDefault()
				e.stopPropagation()
			}
		}
		const closeOnEscape = (e: KeyboardEvent) => {
			if (e.key !== 'Escape') return
			open = false
			root?.querySelector<HTMLElement>(':scope > [aria-haspopup]')?.focus()
		}

		// En capture : passer avant le routeur de SvelteKit, qui écoute les clics de liens.
		document.addEventListener('click', closeOnOutside, true)
		document.addEventListener('keydown', closeOnEscape)
		return () => {
			document.removeEventListener('click', closeOnOutside, true)
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

	/**
	 * Apparition en fondu, glissée de `--menu-enter-y` (le sens d'où vient le panneau).
	 * Un panneau fixé à l'écran prend plus de temps qu'un menu déroulant : il couvre la
	 * page, et son voile s'installe avec lui (l'opacité porte aussi l'ombre). Sans
	 * mouvement si l'utilisateur l'a demandé : le fondu suffit.
	 */
	function reveal(node: HTMLElement, { leaving = false }: { leaving?: boolean } = {}) {
		const style = getComputedStyle(node)
		const sheet = style.position === 'fixed'
		const still = matchMedia('(prefers-reduced-motion: reduce)').matches
		// Par défaut, un menu déroulant descend de quelques pixels vers sa place.
		const y = still ? 0 : parseFloat(style.getPropertyValue('--menu-enter-y') || '-4')
		const gone = leaving && swiped
		if (gone) swiped = false
		const duration = gone ? 0 : (sheet ? 220 : 120) * (leaving ? 0.7 : 1)
		return {
			duration,
			easing: cubicOut,
			css: (t: number, u: number) => `opacity: ${t}; transform: translateY(${u * y}px)`
		}
	}

	// Quand un geste a fait sortir le panneau, la transition de sortie n'a plus rien à
	// jouer : il est déjà parti.
	let swiped = false

	/**
	 * Glisser un panneau fixé à l'écran vers son bord d'origine (le haut pour les
	 * notifications, le bas pour « + Ajouter ») le referme, comme un store qu'on rend.
	 * Le geste ne prend la main que s'il est surtout vertical, dans ce sens, et que le
	 * contenu défilant dessous est au bout : sinon c'est un défilement ordinaire.
	 */
	function swipeAway(node: HTMLElement) {
		let startX = 0
		let startY = 0
		let startT = 0
		let dragging = false
		let decided = false
		let sign = 1

		const scrollerAtEdge = (target: EventTarget | null, dir: number) => {
			for (let el = target as HTMLElement | null; el && el !== node; el = el.parentElement) {
				if (el.scrollHeight <= el.clientHeight) continue
				if (!['auto', 'scroll'].includes(getComputedStyle(el).overflowY)) continue
				// Fermer vers le haut (dir -1) : il faut être au bout du bas, et inversement.
				const atEnd =
					dir < 0 ? el.scrollTop + el.clientHeight >= el.scrollHeight - 1 : el.scrollTop <= 0
				if (!atEnd) return false
			}
			return true
		}

		const start = (e: TouchEvent) => {
			if (getComputedStyle(node).position !== 'fixed' || e.touches.length !== 1) return
			startX = e.touches[0].clientX
			startY = e.touches[0].clientY
			startT = e.timeStamp
			dragging = false
			decided = false
			sign = parseFloat(getComputedStyle(node).getPropertyValue('--menu-enter-y') || '-4') < 0 ? -1 : 1
		}
		const move = (e: TouchEvent) => {
			if (e.touches.length !== 1 || (decided && !dragging)) return
			const dx = e.touches[0].clientX - startX
			const dy = e.touches[0].clientY - startY
			if (!decided) {
				if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
				decided = true
				dragging = Math.abs(dy) > Math.abs(dx) && dy * sign > 0 && scrollerAtEdge(e.target, sign)
				if (!dragging) return
				node.style.transition = 'none'
			}
			e.preventDefault()
			const d = Math.max(0, dy * sign)
			node.style.transform = `translateY(${d * sign}px)`
			node.style.opacity = String(Math.max(0.3, 1 - d / 300))
		}
		const end = (e: TouchEvent) => {
			if (!dragging) return
			dragging = false
			const dy = (e.changedTouches[0].clientY - startY) * sign
			const fast = dy / Math.max(1, e.timeStamp - startT) > 0.5
			if (dy > 80 || (fast && dy > 30)) {
				swiped = true
				node.style.transition = 'transform 160ms ease-out, opacity 160ms ease-out'
				node.style.transform = `translateY(${sign * (node.offsetHeight + 40)}px)`
				node.style.opacity = '0'
				setTimeout(() => (open = false), 160)
			} else {
				node.style.transition = 'transform 160ms ease-out, opacity 160ms ease-out'
				node.style.transform = ''
				node.style.opacity = ''
			}
		}

		node.addEventListener('touchstart', start, { passive: true })
		node.addEventListener('touchmove', move, { passive: false })
		node.addEventListener('touchend', end)
		node.addEventListener('touchcancel', end)
		return {
			destroy() {
				node.removeEventListener('touchstart', start)
				node.removeEventListener('touchmove', move)
				node.removeEventListener('touchend', end)
				node.removeEventListener('touchcancel', end)
			}
		}
	}

	const triggerProps = $derived<MenuTriggerProps>({
		onclick: () => (open = !open),
		'aria-haspopup': role,
		'aria-expanded': open
	})
</script>

<div class="menu {className}" bind:this={root}>
	{@render trigger(triggerProps)}

	{#if open}
		<div
			class="menu-panel"
			class:align-left={alignLeft}
			{role}
			aria-label={label}
			bind:this={panel}
			use:swipeAway
			in:reveal
			out:reveal={{ leaving: true }}
		>
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
