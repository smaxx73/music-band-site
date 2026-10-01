<script lang="ts">
	import type { PageData } from './$types'
	import { enhance } from '$app/forms'

	let { data }: { data: PageData } = $props()

	type AudioFormat = { id: number; label: string; mime_types: string[]; enabled: boolean }

	let formats = $derived(data.formats as unknown as AudioFormat[])
	let submitting = $state<number | null>(null)
	let globalError = $state<string | null>(null)

	function toggle(format: AudioFormat) {
		const newEnabled = !format.enabled
		submitting = format.id
		globalError = null

		const body = new FormData()
		body.set('id', String(format.id))
		body.set('enabled', String(newEnabled))

		fetch('?/toggleFormat', { method: 'POST', body })
			.then(async (res) => {
				if (!res.ok) {
					const json = await res.json().catch(() => ({}))
					globalError = json?.data?.error ?? 'Erreur lors de la mise à jour.'
					return
				}
				formats = formats.map((f) => f.id === format.id ? { ...f, enabled: newEnabled } : f)
			})
			.catch(() => { globalError = 'Erreur réseau.' })
			.finally(() => { submitting = null })
	}
</script>

<svelte:head>
	<title>Paramètres — Admin</title>
</svelte:head>

<main class="page page-narrow">
	<nav class="breadcrumb">
		<a href="/">Tableau de bord</a> /
		<a href="/admin">Administration</a> /
		<span>Paramètres</span>
	</nav>

	<h1>Paramètres</h1>

	<section class="section">
		<h2 class="section-title">Formats d'import autorisés</h2>
		<p class="form-hint intro">Seuls les formats activés seront acceptés lors de l'upload.</p>

		{#if globalError}
			<p class="message-error">{globalError}</p>
		{/if}

		<div class="formats-list">
			{#each formats as format (format.id)}
				<div class="format-row" class:disabled={submitting === format.id}>
					<div class="format-info">
						<span class="format-label">{format.label}</span>
						<span class="format-mimes">{format.mime_types.join(', ')}</span>
					</div>
					<button
						type="button"
						class="toggle"
						class:on={format.enabled}
						aria-pressed={format.enabled}
						disabled={submitting === format.id}
						onclick={() => toggle(format)}
						aria-label="{format.enabled ? 'Désactiver' : 'Activer'} {format.label}"
					>
						{format.enabled ? 'Activé' : 'Désactivé'}
					</button>
				</div>
			{/each}
		</div>
	</section>
</main>

<style>
	h1 { font-size: var(--text-xl); margin: 0 0 2rem; }

	.section-title { margin-bottom: 0.5rem; }
	.intro { margin: 0 0 1.25rem; }
	.section .message-error { margin-bottom: 0.75rem; }

	.formats-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.format-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		border: 1px solid var(--color-border-light);
		border-radius: var(--radius-lg);
		background: var(--color-bg-subtle);
		gap: 1rem;
		transition: opacity 0.15s;
	}

	.format-row.disabled { opacity: 0.6; pointer-events: none; }

	.format-info {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 0;
	}

	.format-label {
		font-weight: 600;
		font-size: 0.9rem;
	}

	.format-mimes {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.toggle {
		flex-shrink: 0;
		padding: 0.3rem 0.85rem;
		border-radius: var(--radius-pill);
		border: none;
		font-family: inherit;
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
		transition: filter 0.15s;
		background: var(--color-bg-muted);
		color: var(--color-text-secondary);
	}

	.toggle.on {
		background: var(--color-success-bg);
		color: var(--color-success-text);
	}

	.toggle:hover:not(:disabled) { filter: brightness(0.95); }
	.toggle:disabled { cursor: not-allowed; }
</style>
