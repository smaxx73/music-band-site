<script lang="ts">
	import type { LayoutData } from './$types'
	import favicon from '$lib/assets/favicon.svg'
	import { page } from '$app/state'

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props()

	function isActive(prefix: string) {
		if (prefix === '/') return page.url.pathname === '/'
		return page.url.pathname === prefix || page.url.pathname.startsWith(prefix + '/')
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{#if data.user}
	<nav>
		<div class="nav-inner">
			<a href="/" class="nav-brand">Répétitions</a>
			<ul class="nav-links">
				<li><a href="/sessions" class:active={isActive('/sessions')}>Sessions</a></li>
				<li><a href="/songs" class:active={isActive('/songs')}>Morceaux</a></li>
				<li><a href="/playlists" class:active={isActive('/playlists')}>Playlists</a></li>
				<li><a href="/admin" class:active={isActive('/admin')} class="nav-admin">Admin</a></li>
			</ul>
			<a href="/upload" class="nav-upload" class:active={isActive('/upload')}>+ Uploader</a>
		</div>
	</nav>
{/if}

{@render children()}

<style>
	nav {
		position: sticky;
		top: 0;
		z-index: 100;
		background: #fff;
		border-bottom: 1px solid #e8e8e8;
		font-family: sans-serif;
	}

	.nav-inner {
		max-width: 960px;
		margin: 0 auto;
		padding: 0 1rem;
		height: 52px;
		display: flex;
		align-items: center;
		gap: 2rem;
	}

	.nav-brand {
		font-weight: 700;
		font-size: 1rem;
		color: #1a1a1a;
		text-decoration: none;
		white-space: nowrap;
		flex-shrink: 0;
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
		border-radius: 4px;
		font-size: 0.875rem;
		color: #555;
		text-decoration: none;
		transition: color 0.1s, background 0.1s;
	}

	.nav-links a:hover {
		color: #1a1a1a;
		background: #f5f5f5;
	}

	.nav-links a.active {
		color: #1a1a1a;
		font-weight: 600;
	}

	.nav-admin {
		color: #999 !important;
		font-size: 0.8rem !important;
	}

	.nav-admin.active,
	.nav-admin:hover {
		color: #555 !important;
	}

	.nav-upload {
		flex-shrink: 0;
		padding: 0.4rem 0.9rem;
		background: #1a1a1a;
		color: #fff;
		border-radius: 4px;
		text-decoration: none;
		font-size: 0.875rem;
		font-weight: 600;
		white-space: nowrap;
		transition: background 0.1s;
	}

	.nav-upload:hover {
		background: #333;
	}

	.nav-upload.active {
		background: #333;
	}

	@media (max-width: 540px) {
		.nav-inner {
			gap: 0.75rem;
			height: auto;
			flex-wrap: wrap;
			padding: 0.5rem 1rem;
		}

		.nav-links {
			order: 3;
			width: 100%;
			padding-bottom: 0.25rem;
		}
	}
</style>
