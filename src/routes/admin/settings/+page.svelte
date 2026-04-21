<script lang="ts">
	import type { PageData } from './$types'
	import { enhance } from '$app/forms'

	let { data }: { data: PageData } = $props()

	type AudioFormat = { id: number; label: string; mime_types: string[]; enabled: boolean }

	let formats = $state(data.formats as unknown as AudioFormat[])
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

<main>
	<nav class="breadcrumb">
		<a href="/">Tableau de bord</a> /
		<a href="/admin">Administration</a> /
		<span>Paramètres</span>
	</nav>

	<h1>Paramètres</h1>

	<section class="section">
		<h2>Formats d'import autorisés</h2>
		<p class="hint">Seuls les formats activés seront acceptés lors de l'upload.</p>

		{#if globalError}
			<p class="message-error">{globalError}</p>
		{/if}

		<div class="formats-list">
			{#each formats as format (format.id)}
				<label class="format-row" class:disabled={submitting === format.id}>
					<div class="format-info">
						<span class="format-label">{format.label}</span>
						<span class="format-mimes">{format.mime_types.join(', ')}</span>
					</div>
					<button
						type="button"
						class="toggle"
						class:on={format.enabled}
						disabled={submitting === format.id}
						onclick={() => toggle(format)}
						aria-label="{format.enabled ? 'Désactiver' : 'Activer'} {format.label}"
					>
						{format.enabled ? 'Activé' : 'Désactivé'}
					</button>
				</label>
			{/each}
		</div>
	</section>
</main>

<style>
	main {
		max-width: 640px;
		margin: 2rem auto;
		padding: 0 1rem;
	}

	.breadcrumb {
		font-size: 0.85rem;
		color: #888;
		margin-bottom: 1.25rem;
	}

	.breadcrumb a { color: inherit; text-decoration: none; }
	.breadcrumb a:hover { text-decoration: underline; }

	h1 { font-size: var(--text-xl); margin-bottom: 2rem; }

	h2 {
		font-size: 1rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: #888;
		margin: 0 0 0.5rem;
		padding-bottom: 0.4rem;
		border-bottom: 1px solid #ebebeb;
	}

	.hint {
		font-size: 0.85rem;
		color: #999;
		margin: 0 0 1.25rem;
	}

	.section { margin-bottom: 2.5rem; }

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
		border: 1px solid #e8e8e8;
		border-radius: 6px;
		background: #fafafa;
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
		font-size: 0.75rem;
		color: #aaa;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.toggle {
		flex-shrink: 0;
		padding: 0.3rem 0.85rem;
		border-radius: 20px;
		border: none;
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.15s, color 0.15s;
		background: #e0e0e0;
		color: #666;
	}

	.toggle.on {
		background: #d1fae5;
		color: #065f46;
	}

	.toggle:hover:not(:disabled).on { background: #a7f3d0; }
	.toggle:hover:not(:disabled):not(.on) { background: #d0d0d0; }
	.toggle:disabled { cursor: not-allowed; }

	.message-error {
		color: #c0392b;
		font-size: 0.875rem;
		margin-bottom: 0.75rem;
	}
</style>
