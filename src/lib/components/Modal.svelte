<script module lang="ts">
	// Modales ouvertes, la plus récente en dernier : une confirmation s'ouvre souvent
	// par-dessus une autre modale, et Échap ne doit fermer que celle du dessus.
	const openModals: symbol[] = []
</script>

<script lang="ts">
	import { onMount, type Snippet } from 'svelte'
	import Icon from '$lib/components/Icon.svelte'

	let {
		title,
		size = 'md',
		onClose,
		children
	}: {
		title: string
		size?: 'sm' | 'md'
		onClose: () => void
		children: Snippet
	} = $props()

	const id = Symbol()
	onMount(() => {
		openModals.push(id)
		return () => openModals.splice(openModals.indexOf(id), 1)
	})
</script>

<svelte:window
	onkeydown={(e) => {
		if (e.key === 'Escape' && openModals.at(-1) === id) onClose()
	}}
/>

<div class="modal-backdrop">
	<!-- Bouton plein écran derrière la modale : fermeture au clic hors modale -->
	<button type="button" class="modal-backdrop-close" aria-label="Fermer" onclick={onClose}></button>
	<div class="modal" class:modal-sm={size === 'sm'} role="dialog" aria-modal="true" aria-label={title}>
		<div class="modal-header">
			<h2>{title}</h2>
			<button class="modal-close" aria-label="Fermer" onclick={onClose}><Icon name="close" size="0.95rem" /></button>
		</div>
		{@render children()}
	</div>
</div>
