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
		<a href="/" class="btn-home">← Retour à l'accueil</a>
	</div>
</main>

<style>
	main {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 60vh;
		font-family: sans-serif;
		padding: 2rem 1rem;
	}

	.error-box {
		text-align: center;
		max-width: 400px;
	}

	.status {
		font-size: 4rem;
		font-weight: 800;
		color: #e0e0e0;
		margin: 0 0 0.25rem;
		line-height: 1;
	}

	h1 {
		font-size: 1.4rem;
		margin: 0 0 0.75rem;
		color: #1a1a1a;
	}

	.message {
		font-size: 0.9rem;
		color: #888;
		margin: 0 0 1.5rem;
	}

	.btn-home {
		display: inline-block;
		padding: 0.5rem 1.25rem;
		border: 1px solid #ccc;
		border-radius: 4px;
		text-decoration: none;
		font-size: 0.875rem;
		color: inherit;
	}

	.btn-home:hover { background: #f4f4f4; }
</style>
