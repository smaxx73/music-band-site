<!-- Journal des nouveautés : le CHANGELOG.md tel qu'il est publié, sans les notes de
     déploiement (migrations, variables d'environnement). -->
<script lang="ts">
	import { onMount } from 'svelte'
	import { CHANGELOG } from '$lib/changelog'
	import { compareVersions, splitInline } from '$lib/changelog-parse'
	import { APP_VERSION } from '$lib/version'
	import { loadSeen, markSeen, whatsNew } from '$lib/whats-new.svelte'

	// La version vue avant cette visite : c'est elle qui dit ce qui est « nouveau » sur la page.
	// Relue avant d'être écrasée, pour que les marques restent le temps de la lecture.
	let previous = $state<string | null>(null)

	onMount(() => {
		loadSeen()
		previous = whatsNew.seen
		markSeen()
	})

	const entries = CHANGELOG.filter((entry) => compareVersions(entry.version, APP_VERSION) <= 0)

	function formatDate(date: string) {
		return new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', {
			day: 'numeric',
			month: 'long',
			year: 'numeric',
		})
	}
</script>

<svelte:head>
	<title>Nouveautés — BandStash</title>
</svelte:head>

<main class="page page-narrow">
	<div class="page-header">
		<h1>Nouveautés</h1>
	</div>
	<p class="lead">L'évolution de BandStash, de la plus récente à la plus ancienne.</p>

	{#each entries as entry (entry.version)}
		<section class="release" aria-labelledby="v{entry.version}">
			<h2 id="v{entry.version}">
				Version {entry.version}
				{#if previous && compareVersions(entry.version, previous) > 0}
					<span class="badge-new">Nouveau</span>
				{/if}
			</h2>
			<p class="date">{formatDate(entry.date)}</p>
			<ul>
				{#each entry.items as item}
					<li>
						{#each splitInline(item) as part}
							{#if part.kind === 'bold'}<strong>{part.text}</strong>{:else if part.kind === 'code'}<code>{part.text}</code>{:else}{part.text}{/if}
						{/each}
					</li>
				{/each}
			</ul>
		</section>
	{/each}
</main>

<style>
	.lead {
		margin: 0 0 1.5rem;
		color: var(--color-text-muted);
	}

	.release {
		margin-bottom: 2rem;
	}

	.release h2 {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0;
		font-size: var(--text-lg);
	}

	.badge-new {
		padding: 0.1rem 0.5rem;
		border-radius: var(--radius-md);
		background: var(--color-bg-subtle);
		border: 1px solid var(--color-accent);
		color: var(--color-text);
		font-size: var(--text-2xs);
		font-weight: 600;
		text-transform: uppercase;
	}

	.date {
		margin: 0.125rem 0 0.5rem;
		color: var(--color-text-muted);
		font-size: var(--text-sm);
	}

	ul {
		margin: 0;
		padding-left: 1.25rem;
		line-height: 1.55;
	}

	li + li {
		margin-top: 0.5rem;
	}
</style>
