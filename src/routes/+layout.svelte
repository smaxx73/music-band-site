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

	const userInitials = $derived(
		data.user?.name
			.split(' ')
			.map((n) => n[0])
			.join('')
			.slice(0, 2)
			.toUpperCase() ?? ''
	)

	const navItems = [
		{ href: '/', label: 'Tableau de bord', icon: '⊞' },
		{ href: '/sessions', label: 'Sessions', icon: '◎' },
		{ href: '/songs', label: 'Morceaux', icon: '♪' },
		{ href: '/playlists', label: 'Playlists', icon: '≡' },
		{ href: '/agenda', label: 'Agenda', icon: '◻' },
	]
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{#if data.user}
	<div class="app-shell">
		<!-- Top bar -->
		<header class="app-top-bar">
			<a href="/" class="brand">🎸 BandApp</a>
			<div class="top-spacer"></div>
			{#if data.user.groups.length > 1}
				<select class="group-select" onchange={switchGroup}>
					{#each data.user.groups as g}
						<option value={g.id} selected={g.id === data.user.current_group_id}>{g.name}</option>
					{/each}
				</select>
			{:else if currentGroup}
				<span class="group-chip">{currentGroup.name}</span>
			{/if}
			<div class="user-avatar" title={data.user.name}>{userInitials}</div>
		</header>

		<div class="app-body">
			<!-- Sidebar -->
			<nav class="app-sidebar">
				<ul class="sidebar-nav">
					{#each navItems as item}
						<li>
							<a href={item.href} class="sidebar-link" class:active={isActive(item.href)}>
								<span class="nav-icon">{item.icon}</span>
								{item.label}
							</a>
						</li>
					{/each}
					{#if data.user?.role === 'admin'}
						<li class="sidebar-sep"></li>
						<li>
							<a href="/admin" class="sidebar-link sidebar-link--admin" class:active={isActive('/admin')}>
								<span class="nav-icon">⚙</span>
								Admin
							</a>
						</li>
					{/if}
				</ul>

				<div class="sidebar-spacer"></div>

				<a href="/upload" class="sidebar-upload" class:active={isActive('/upload')}>
					+ Uploader
				</a>

				<div class="sidebar-user">
					<div class="sidebar-avatar">{userInitials}</div>
					<span class="sidebar-username">{data.user.name}</span>
				</div>
			</nav>

			<!-- Page content -->
			<div class="app-content">
				{#if data.user.groups.length === 0}
					<div class="no-group-banner">
						{#if data.user.role === 'admin'}
							Aucun groupe configuré. <a href="/admin/groups">Créer un groupe</a>
						{:else}
							Vous n'appartenez à aucun groupe. Contactez un administrateur.
						{/if}
					</div>
				{/if}
				{@render children()}
			</div>
		</div>
	</div>
{:else}
	{@render children()}
{/if}

<style>
	/* ─── Top bar ────────────────────────────────── */
	.brand {
		font-weight: 700;
		font-size: 1rem;
		color: #fff;
		text-decoration: none;
		white-space: nowrap;
		flex-shrink: 0;
		letter-spacing: -0.01em;
	}

	.top-spacer { flex: 1; }

	.group-select {
		font-size: 0.78rem;
		color: var(--color-mid);
		border: 1px solid rgba(255,255,255,0.15);
		border-radius: var(--radius-md);
		padding: 0.2rem 0.5rem;
		background: rgba(255,255,255,0.07);
		cursor: pointer;
		max-width: 150px;
		flex-shrink: 0;
		color-scheme: dark;
	}

	.group-chip {
		font-size: 0.78rem;
		color: var(--color-mid);
		white-space: nowrap;
		flex-shrink: 0;
		max-width: 150px;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.user-avatar {
		width: 30px;
		height: 30px;
		border-radius: 50%;
		background: var(--color-accent-light);
		color: var(--color-accent);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.7rem;
		font-weight: 700;
		flex-shrink: 0;
		border: 1.5px solid var(--color-accent);
	}

	/* ─── Sidebar ────────────────────────────────── */
	.sidebar-nav {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.sidebar-link {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 7px 10px;
		border-radius: var(--radius-md);
		font-size: 0.82rem;
		color: var(--color-mid);
		text-decoration: none;
		transition: background 0.1s, color 0.1s;
	}

	.sidebar-link:hover {
		background: rgba(255,255,255,0.07);
		color: #d8d4cc;
	}

	.sidebar-link.active {
		background: var(--color-accent);
		color: #fff;
	}

	.sidebar-link--admin {
		font-size: 0.76rem;
	}

	.nav-icon {
		font-size: 0.85rem;
		opacity: 0.8;
		flex-shrink: 0;
	}

	.sidebar-sep {
		height: 1px;
		background: rgba(255,255,255,0.08);
		margin: 6px 4px;
	}

	.sidebar-spacer { flex: 1; }

	.sidebar-upload {
		display: block;
		margin: 0 0 10px;
		padding: 7px 10px;
		background: var(--color-accent);
		color: #fff;
		border-radius: var(--radius-md);
		text-decoration: none;
		font-size: 0.82rem;
		font-weight: 600;
		text-align: center;
		transition: opacity 0.1s;
	}

	.sidebar-upload:hover {
		opacity: 0.88;
	}

	.sidebar-upload.active {
		opacity: 0.75;
	}

	.sidebar-user {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 4px;
		border-top: 1px solid rgba(255,255,255,0.08);
	}

	.sidebar-avatar {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		border: 1.5px solid var(--color-mid);
		background: transparent;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.6rem;
		font-weight: 700;
		color: var(--color-mid);
		flex-shrink: 0;
	}

	.sidebar-username {
		font-size: 0.75rem;
		color: var(--color-mid);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* ─── No-group banner ────────────────────────── */
	.no-group-banner {
		background: #fff8e1;
		border-bottom: 1px solid #ffe082;
		padding: 0.5rem 1rem;
		font-size: 0.82rem;
		text-align: center;
		color: #6d4c00;
	}

	.no-group-banner a {
		color: inherit;
		font-weight: 600;
	}

	/* ─── Mobile: replaces sidebar with compact top nav ─ */
	@media (max-width: 640px) {
		.app-shell {
			height: auto;
			overflow: visible;
		}

		.app-body {
			flex-direction: column;
			overflow: visible;
		}

		.app-sidebar {
			width: 100%;
			flex-direction: row;
			padding: 0 8px;
			gap: 0;
			overflow-x: auto;
			overflow-y: visible;
			border-right: none;
			border-bottom: 1px solid rgba(255,255,255,0.08);
		}

		.sidebar-nav {
			flex-direction: row;
			gap: 2px;
		}

		.sidebar-link {
			white-space: nowrap;
			padding: 8px 10px;
			gap: 5px;
		}

		.nav-icon { display: none; }

		.sidebar-sep { display: none; }

		.sidebar-spacer { display: none; }

		.sidebar-upload {
			margin: 4px 0 4px 6px;
			padding: 6px 12px;
			white-space: nowrap;
			flex-shrink: 0;
		}

		.sidebar-user { display: none; }

		.app-content {
			overflow-y: visible;
		}
	}
</style>
