<!-- Page d'accueil publique : montrée sur "/" hors connexion, et toujours sur "/accueil".
     Hors connexion, le formulaire de connexion (celui de /login, même action) ne se
     déplie qu'après un clic sur "Se connecter" — la description reste visible avant. -->
<script lang="ts">
	import { enhance } from '$app/forms'
	import { page } from '$app/state'

	let { loggedIn = false }: { loggedIn?: boolean } = $props()

	let showLogin = $state(false)
</script>

<main class="landing">
	<img src="/brand/bandstash-logo.png" alt="BandStash" class="landing-logo" />
	<p class="landing-tagline">
		L'espace privé de votre groupe pour partager vos enregistrements de répétition,
		suivre vos morceaux et organiser vos sessions.
	</p>

	{#if !loggedIn}
		{#if !showLogin}
			<button type="button" class="btn btn-primary landing-cta" onclick={() => (showLogin = true)}>
				Se connecter
			</button>
		{:else}
			<form method="POST" action="/login" use:enhance class="landing-login-form">
				{#if page.form?.error}
					<p class="message-error">{page.form.error}</p>
				{/if}

				<label class="form-label">
					Pseudo
					<input class="form-input" type="text" name="nickname" required autocomplete="username" />
				</label>

				<label class="form-label">
					Mot de passe
					<input class="form-input" type="password" name="password" required autocomplete="current-password" />
				</label>

				<div class="landing-login-actions">
					<button type="button" class="btn btn-ghost btn-sm" onclick={() => (showLogin = false)}>Annuler</button>
					<button type="submit" class="btn btn-primary">Se connecter</button>
				</div>
			</form>
		{/if}
	{/if}
</main>

<style>
	.landing {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		min-height: 100%;
		padding: 2rem 1.5rem;
		text-align: center;
	}

	.landing-logo {
		width: min(180px, 55vw);
		height: auto;
		border-radius: var(--radius-xl);
		margin-bottom: 0.5rem;
	}

	.landing h1 {
		margin: 0;
		font-size: var(--text-xl);
	}

	.landing-tagline {
		max-width: 32rem;
		margin: 0;
		color: var(--color-text-secondary);
	}

	.landing-cta {
		margin-top: 0.5rem;
	}

	.landing-login-form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		width: 280px;
		max-width: 100%;
		margin-top: 0.5rem;
		text-align: left;
	}

	.landing-login-actions {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
</style>
