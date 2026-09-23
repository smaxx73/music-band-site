<!-- Pages légales : publiques (voir PUBLIC_PATHS dans +layout.server.ts), lues aussi bien
     hors connexion, sans la coquille applicative, que depuis l'application. -->
<script lang="ts">
	import LegalLinks from '$lib/components/LegalLinks.svelte'

	let { children }: { children: import('svelte').Snippet } = $props()
</script>

<article class="legal">
	<a href="/" class="legal-home">
		<img src="/brand/bandstash-mark-simple.svg" alt="" width="20" height="20" />
		BandStash
	</a>
	{@render children()}
	<LegalLinks />
</article>

<style>
	.legal {
		max-width: 46rem;
		margin: 0 auto;
		padding: 2rem 1rem 3rem;
		line-height: 1.6;
	}

	.legal-home {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 1.5rem;
		font-weight: 600;
		color: inherit;
		text-decoration: none;
	}

	.legal :global(h1) {
		margin: 0 0 0.25rem;
	}

	.legal :global(h2) {
		margin: 2rem 0 0.5rem;
		font-size: var(--text-lg);
	}

	.legal :global(.legal-updated) {
		margin: 0 0 1.5rem;
		color: var(--color-text-secondary);
		font-size: var(--text-sm);
	}

	.legal :global(dl) {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0.25rem 1rem;
		margin: 0;
	}

	.legal :global(dt) {
		color: var(--color-text-secondary);
	}

	.legal :global(dd) {
		margin: 0;
		overflow-wrap: anywhere;
	}

	@media (max-width: 640px) {
		.legal :global(dl) {
			grid-template-columns: 1fr;
		}

		.legal :global(dd) {
			margin-bottom: 0.5rem;
		}
	}
</style>
