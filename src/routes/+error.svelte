<script lang="ts">
	import { page } from '$app/stores'
	import { invalidateAll } from '$app/navigation'

	// Le contenu visé appartient à un autre groupe de l'utilisateur, et la requête ne
	// permettait pas de basculer d'office (voir src/lib/server/group-scope.ts) : la
	// bascule se fait ici, à son clic, et pas dans son dos.
	const switchGroup = $derived($page.error?.switch_group ?? null)
	let switching = $state(false)
	let switchError = $state<string | null>(null)

	async function switchAndRetry() {
		if (!switchGroup || switching) return
		switching = true
		switchError = null
		try {
			const res = await fetch('/api/groups/switch', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ group_id: switchGroup.id })
			})
			if (!res.ok) {
				const json = await res.json().catch(() => ({}))
				switchError = json.error ?? 'La bascule a échoué.'
				return
			}
			// Le groupe actif a changé pour toute l'application : tout recharger, pas
			// seulement cette page, sinon la barre du haut continuerait d'afficher l'ancien.
			await invalidateAll()
			location.reload()
		} catch {
			switchError = 'Erreur réseau.'
		} finally {
			switching = false
		}
	}
</script>

<svelte:head>
	<title>Erreur {$page.status}</title>
</svelte:head>

<main>
	<div class="error-box">
		<p class="status">{$page.status}</p>
		<h1>
			{#if switchGroup}
				Contenu d'un autre groupe
			{:else if $page.status === 404}
				Page introuvable
			{:else if $page.status === 403}
				Accès refusé
			{:else}
				Une erreur est survenue
			{/if}
		</h1>
		<p class="message">{$page.error?.message ?? ''}</p>
		{#if switchGroup}
			<button class="btn btn-primary" onclick={switchAndRetry} disabled={switching}>
				{switching ? 'Bascule…' : `Basculer sur « ${switchGroup.name} » et l'ouvrir`}
			</button>
			{#if switchError}<p class="switch-error">{switchError}</p>{/if}
			<p class="switch-hint">Le groupe actif change pour tous vos onglets.</p>
		{/if}
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

	.switch-error {
		font-size: var(--text-sm);
		color: var(--color-error);
		margin: 0.75rem 0 0;
	}

	.switch-hint {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		margin: 0.5rem 0 1.25rem;
	}
</style>
