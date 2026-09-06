<script lang="ts">
	import type { Snippet } from 'svelte'

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
</script>

<svelte:window
	onkeydown={(e) => {
		if (e.key === 'Escape') onClose()
	}}
/>

<div class="modal-backdrop">
	<!-- Bouton plein écran derrière la modale : fermeture au clic hors modale -->
	<button type="button" class="modal-backdrop-close" aria-label="Fermer" onclick={onClose}></button>
	<div class="modal" class:modal-sm={size === 'sm'} role="dialog" aria-modal="true" aria-label={title}>
		<div class="modal-header">
			<h2>{title}</h2>
			<button class="modal-close" aria-label="Fermer" onclick={onClose}>✕</button>
		</div>
		{@render children()}
	</div>
</div>
