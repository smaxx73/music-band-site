<!-- Liens vers les pages légales : ils doivent être atteignables depuis toute page,
     connecté ou non (LCEN art. 6 III : mentions « directement et facilement accessibles »). -->
<script lang="ts">
	let { compact = false }: { compact?: boolean } = $props()
</script>

<nav class="legal-links" class:compact aria-label="Informations légales">
	<a href="/mentions-legales">Mentions légales</a>
	<span aria-hidden="true">·</span>
	<a href="/confidentialite">Confidentialité</a>
</nav>

<style>
	.legal-links {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.25rem 0.5rem;
		margin-top: 2rem;
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
	}

	.legal-links a {
		color: inherit;
	}

	.legal-links.compact {
		justify-content: flex-start;
		margin-top: 0;
		font-size: var(--text-xs, 0.75rem);
	}
</style>
