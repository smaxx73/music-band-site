<script lang="ts">
	import type { ActionData } from './$types'

	let { form }: { form: ActionData } = $props()
</script>

<svelte:head>
	<title>Connexion — BandStash</title>
</svelte:head>

<div class="wrapper">
	<img src="/brand/bandstash-logo.png" alt="BandStash" class="login-logo" />
	<h1>Connexion</h1>

	<form method="POST">
		{#if form?.error}
			<p class="message-error">{form.error}</p>
		{/if}

		<label class="form-label">
			Pseudo
			<input class="form-input" type="text" name="nickname" required autocomplete="username" />
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
		margin: 0 0 2rem;
		font-size: var(--text-xl);
	}

	.login-logo {
		display: block;
		width: min(220px, 68vw);
		height: auto;
		margin-bottom: 1.5rem;
		border-radius: var(--radius-xl);
		background: #fff;
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
