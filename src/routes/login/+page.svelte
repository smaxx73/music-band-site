<script lang="ts">
	import type { ActionData } from './$types'

	let { form }: { form: ActionData } = $props()
</script>

<svelte:head>
	<title>Connexion — Band</title>
</svelte:head>

<div class="wrapper">
	<h1>Répétitions du groupe</h1>

	<form method="POST">
		{#if form?.error}
			<p class="error">{form.error}</p>
		{/if}

		<label>
			Prénom
			<input type="text" name="name" required autocomplete="given-name" />
		</label>

		<label>
			Mot de passe
			<input type="password" name="password" required autocomplete="current-password" />
		</label>

		<button type="submit">Se connecter</button>
	</form>
</div>

<style>
	.wrapper {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		font-family: sans-serif;
	}

	h1 {
		margin-bottom: 2rem;
		font-size: 1.5rem;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		width: 280px;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.875rem;
		font-weight: 600;
	}

	input {
		padding: 0.5rem 0.75rem;
		border: 1px solid #ccc;
		border-radius: 4px;
		font-size: 1rem;
	}

	button {
		padding: 0.625rem;
		background: #1a1a1a;
		color: white;
		border: none;
		border-radius: 4px;
		font-size: 1rem;
		cursor: pointer;
	}

	button:hover {
		background: #333;
	}

	.error {
		color: #c0392b;
		font-size: 0.875rem;
		margin: 0;
	}
</style>
