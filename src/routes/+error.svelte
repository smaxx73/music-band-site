<script lang="ts">
	import { page } from '$app/stores'
</script>

<svelte:head>
	<title>Erreur {$page.status}</title>
</svelte:head>

<main>
	<div class="error-box">
		<p class="status">{$page.status}</p>
		<h1>
			{#if $page.status === 404}
				Page introuvable
			{:else if $page.status === 403}
				Accès refusé
			{:else}
				Une erreur est survenue
			{/if}
		</h1>
		<p class="message">{$page.error?.message ?? ''}</p>
		<a href="/" class="btn btn-secondary">← Retour à l'accueil</a>
	</div>
</main>

<style>
	main {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 60vh;
		padding: 2rem 1rem;
	}

	.error-box {
		text-align: center;
		max-width: 400px;
	}

	.status {
		font-size: 4rem;
		font-weight: 800;
		color: var(--color-border);
		margin: 0 0 0.25rem;
		line-height: 1;
	}

	h1 {
		font-size: 1.4rem;
		margin: 0 0 0.75rem;
		color: var(--color-text);
	}

	.message {
		font-size: 0.9rem;
		color: var(--color-text-muted);
		margin: 0 0 1.5rem;
	}
</style>
