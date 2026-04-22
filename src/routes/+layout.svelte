<script lang="ts">
	import '../app.css'
	import type { LayoutData } from './$types'
	import favicon from '$lib/assets/favicon.svg'
	import { page } from '$app/state'
	import { goto } from '$app/navigation'

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props()

	function isActive(prefix: string) {
		if (prefix === '/') return page.url.pathname === '/'
		return page.url.pathname === prefix || page.url.pathname.startsWith(prefix + '/')
	}

	async function switchGroup(e: Event) {
		const select = e.target as HTMLSelectElement
		const groupId = parseInt(select.value)
		await fetch('/api/groups/switch', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ group_id: groupId })
		})
		goto('/', { invalidateAll: true })
	}

	const currentGroup = $derived(
		data.user?.groups.find((g) => g.id === data.user?.current_group_id)
	)
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{#if data.user}
	<nav>
		<div class="nav-inner">
			<a href="/" class="nav-brand">Répétitions</a>

			{#if data.user.groups.length > 1}
				<select class="group-select" onchange={switchGroup}>
					{#each data.user.groups as g}
						<option value={g.id} selected={g.id === data.user.current_group_id}>{g.name}</option>
					{/each}
				</select>
			{:else if currentGroup}
				<span class="group-name">{currentGroup.name}</span>
			{/if}

			<ul class="nav-links">
				<li><a href="/sessions" class:active={isActive('/sessions')}>Sessions</a></li>
				<li><a href="/songs" class:active={isActive('/songs')}>Morceaux</a></li>
				<li><a href="/playlists" class:active={isActive('/playlists')}>Playlists</a></li>
				{#if data.user?.role === 'admin'}
					<li><a href="/admin" class:active={isActive('/admin')} class="nav-admin">Admin</a></li>
				{/if}
			</ul>
			<a href="/upload" class="nav-upload" class:active={isActive('/upload')}>+ Uploader</a>
		</div>
	</nav>
{/if}

{#if data.user && data.user.groups.length === 0}
	<div class="no-group-banner">
		{#if data.user.role === 'admin'}
			Aucun groupe configuré. <a href="/admin/groups">Créer un groupe</a>
		{:else}
			Vous n'appartenez à aucun groupe. Contactez un administrateur.
		{/if}
	</div>
{/if}

{@render children()}

<style>
	nav {
		position: sticky;
		top: 0;
		z-index: 100;
		background: var(--color-bg);
		border-bottom: 1px solid var(--color-border-light);
	}

	.nav-inner {
		max-width: 960px;
		margin: 0 auto;
		padding: 0 1rem;
		height: 52px;
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.nav-brand {
		font-weight: 700;
		font-size: var(--text-base);
		color: var(--color-text);
		text-decoration: none;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.group-select {
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		border: 1px solid var(--color-border-light);
		border-radius: var(--radius-md);
		padding: 0.2rem 0.5rem;
		background: transparent;
		cursor: pointer;
		max-width: 160px;
		flex-shrink: 0;
	}

	.group-name {
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		white-space: nowrap;
		flex-shrink: 0;
		max-width: 160px;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.nav-links {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		gap: 0.25rem;
		flex: 1;
	}

	.nav-links a {
		display: block;
		padding: 0.3rem 0.65rem;
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		text-decoration: none;
		transition: color 0.1s, background 0.1s;
	}

	.nav-links a:hover {
		color: var(--color-text);
		background: #f5f5f5;
	}

	.nav-links a.active {
		color: var(--color-text);
		font-weight: 600;
	}

	.nav-admin {
		color: #999 !important;
		font-size: 0.8rem !important;
	}

	.nav-admin.active,
	.nav-admin:hover {
		color: var(--color-text-secondary) !important;
	}

	.nav-upload {
		flex-shrink: 0;
		padding: 0.4rem 0.9rem;
		background: var(--color-primary);
		color: #fff;
		border-radius: var(--radius-md);
		text-decoration: none;
		font-size: var(--text-sm);
		font-weight: 600;
		white-space: nowrap;
		transition: background 0.1s;
	}

	.nav-upload:hover {
		background: var(--color-primary-hover);
	}

	.nav-upload.active {
		background: var(--color-primary-hover);
	}

	.no-group-banner {
		background: #fff8e1;
		border-bottom: 1px solid #ffe082;
		padding: 0.6rem 1rem;
		font-size: var(--text-sm);
		text-align: center;
		color: #6d4c00;
	}

	.no-group-banner a {
		color: inherit;
		font-weight: 600;
	}

	@media (max-width: 540px) {
		.nav-inner {
			gap: 0.5rem;
			height: auto;
			flex-wrap: wrap;
			padding: 0.5rem 1rem;
		}

		.nav-links {
			order: 3;
			width: 100%;
			padding-bottom: 0.25rem;
		}

		.group-select,
		.group-name {
			max-width: 120px;
		}
	}
</style>
