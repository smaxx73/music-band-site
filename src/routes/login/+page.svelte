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
			<p class="message-error">{form.error}</p>
		{/if}

		<label class="form-label">
			Prénom
			<input class="form-input" type="text" name="name" required autocomplete="given-name" />
		</label>

		<label class="form-label">
			Mot de passe
			<input class="form-input" type="password" name="password" required autocomplete="current-password" />
		</label>

		<button type="submit" class="btn btn-primary">Se connecter</button>
	</form>
</div>

<style>
	.wrapper {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
	}

	h1 {
		margin-bottom: 2rem;
		font-size: var(--text-xl);
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		width: 280px;
	}

	.btn {
		padding: 0.625rem;
		font-size: var(--text-base);
	}
</style>
