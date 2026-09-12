<script lang="ts">
	import '../app.css'
	import type { LayoutData } from './$types'
	import { page } from '$app/state'
	import { goto, afterNavigate } from '$app/navigation'
	import { groupLogoUrl, isAdmin } from '$lib/types'
	import MiniPlayer from '$lib/components/MiniPlayer.svelte'
	import NotificationsMenu from '$lib/components/NotificationsMenu.svelte'

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props()

	// Menu mobile : tiroir latéral, refermé dès qu'on navigue
	let menuOpen = $state(false)
	afterNavigate(() => { menuOpen = false })

	// Tiroir ouvert : on bloque le défilement du fond
	$effect(() => {
		if (!menuOpen) return
		document.body.style.overflow = 'hidden'
		return () => { document.body.style.overflow = '' }
	})

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
		data.user?.display_name
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
		{ href: '/group', label: 'Mon groupe', icon: '◈' },
	]
</script>

<svelte:head>
	<link rel="icon" type="image/svg+xml" href="/brand/bandstash-mark-simple.svg" />
	<meta name="application-name" content="BandStash" />
</svelte:head>

<svelte:window
	onkeydown={(e) => { if (e.key === 'Escape') menuOpen = false }}
	onresize={() => { if (window.innerWidth > 640) menuOpen = false }}
/>

{#if data.user}
	<div class="app-shell">
		<!-- Top bar -->
		<header class="app-top-bar">
			<button
				class="menu-toggle"
				onclick={() => (menuOpen = !menuOpen)}
				aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
				aria-expanded={menuOpen}
			>{menuOpen ? '✕' : '☰'}</button>
			<a href="/accueil" class="brand" aria-label="BandStash — accueil">
				<img src="/brand/bandstash-mark-simple.svg" alt="" class="brand-mark" />
				<span>BandStash</span>
			</a>
			<div class="top-spacer"></div>
			{#if currentGroup?.logo_version}
				<a href="/group" class="group-logo-link" title="Infos du groupe">
					<img
						src={groupLogoUrl(currentGroup.id, currentGroup.logo_version)}
						alt="Logo de {currentGroup.name}"
						class="group-logo"
					/>
				</a>
			{/if}
			{#if data.user.groups.length > 1}
				<select class="group-select" onchange={switchGroup}>
					{#each data.user.groups as g}
						<option value={g.id} selected={g.id === data.user.current_group_id}>{g.name}</option>
					{/each}
				</select>
				<a href="/group" class="group-info-link" title="Infos du groupe">ⓘ</a>
			{:else if currentGroup}
				<a href="/group" class="group-chip">{currentGroup.name}</a>
			{/if}
			<!-- Sur mobile, ce bloc quitte le header pour devenir une barre d'actions fixée
			     en bas : le header seul n'a pas la place pour logo + groupe + ces trois
			     boutons sans déborder. -->
			<div class="top-actions">
				<a href="/upload" class="top-upload" title="Uploader une prise" aria-label="Uploader une prise">+</a>
				{#if data.user.current_group_id}
					<NotificationsMenu initialUnread={data.unread_notifications ?? 0} />
				{/if}
				<a
					href="/profile"
					class="user-avatar"
					class:active={isActive('/profile')}
					title="{data.user.display_name} — mon profil"
				>{userInitials}</a>
			</div>
		</header>

		<div class="app-body">
			{#if menuOpen}
				<button
					class="nav-backdrop"
					aria-label="Fermer le menu"
					onclick={() => (menuOpen = false)}
				></button>
			{/if}

			<!-- Sidebar (tiroir sur mobile) -->
			<nav class="app-sidebar" class:open={menuOpen}>
				<ul class="sidebar-nav">
					{#each navItems as item}
						<li>
							<a href={item.href} class="sidebar-link" class:active={isActive(item.href)}>
								<span class="nav-icon">{item.icon}</span>
								{item.label}
							</a>
						</li>
					{/each}
					{#if isAdmin(data.user?.role)}
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

				<div class="sidebar-account">
					<a href="/profile" class="sidebar-user" class:active={isActive('/profile')}>
						<div class="sidebar-avatar">{userInitials}</div>
						<span class="sidebar-username">{data.user.display_name}</span>
					</a>
					<form method="POST" action="/logout">
						<button type="submit" class="sidebar-logout" title="Se déconnecter">⏻</button>
					</form>
				</div>
			</nav>

			<!-- Page content -->
			<div class="app-content">
				{#if data.user.groups.length === 0}
					<div class="no-group-banner">
						{#if isAdmin(data.user.role)}
							Aucun groupe configuré. <a href="/admin/groups">Créer un groupe</a>
						{:else}
							Vous n'appartenez à aucun groupe. Contactez un administrateur.
						{/if}
					</div>
				{/if}
				{@render children()}
			</div>
		</div>

		<MiniPlayer />
	</div>
{:else}
	{@render children()}
{/if}

<style>
	/* ─── Top bar ────────────────────────────────── */
	/* Bouton menu et raccourci upload : mobile uniquement */
	.menu-toggle,
	.top-upload,
	.nav-backdrop { display: none; }

	.menu-toggle {
		width: 32px;
		height: 32px;
		align-items: center;
		justify-content: center;
		margin-left: -6px;
		background: transparent;
		border: none;
		border-radius: var(--radius-md);
		color: #fff;
		font-size: 1rem;
		line-height: 1;
		cursor: pointer;
		flex-shrink: 0;
	}

	.menu-toggle:hover { background: rgba(255,255,255,0.1); }

	.top-upload {
		width: 30px;
		height: 30px;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		background: var(--color-accent);
		color: #fff;
		font-size: 1.1rem;
		font-weight: 600;
		line-height: 1;
		text-decoration: none;
		flex-shrink: 0;
	}

	.brand {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 700;
		font-size: 1rem;
		color: #fff;
		text-decoration: none;
		white-space: nowrap;
		flex-shrink: 0;
		letter-spacing: -0.01em;
	}

	.brand-mark {
		width: 30px;
		height: 30px;
		object-fit: contain;
		flex-shrink: 0;
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
		text-decoration: none;
	}
	.group-chip:hover { text-decoration: underline; }

	.group-logo-link { display: flex; flex-shrink: 0; }

	.group-logo {
		width: 26px;
		height: 26px;
		border-radius: 50%;
		object-fit: cover;
		background: #fff;
	}

	.group-info-link {
		color: var(--color-mid);
		text-decoration: none;
		font-size: 0.9rem;
		flex-shrink: 0;
	}
	.group-info-link:hover { color: #fff; }

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
		text-decoration: none;
		transition: filter 0.1s;
	}

	.user-avatar:hover,
	.user-avatar.active {
		filter: brightness(1.08);
		box-shadow: 0 0 0 2px rgba(224, 123, 58, 0.35);
	}

	.top-actions {
		display: flex;
		align-items: center;
		gap: 0.9rem;
		flex-shrink: 0;
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

	.sidebar-account {
		display: flex;
		align-items: center;
		gap: 4px;
		border-top: 1px solid rgba(255,255,255,0.08);
	}

	.sidebar-account form {
		margin: 0;
		flex-shrink: 0;
	}

	.sidebar-user {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 4px;
		flex: 1;
		min-width: 0;
		color: inherit;
		text-decoration: none;
		border-radius: 6px;
	}

	.sidebar-user:hover,
	.sidebar-user.active {
		background: rgba(255,255,255,0.08);
	}

	.sidebar-logout {
		flex-shrink: 0;
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		border-radius: 6px;
		color: var(--color-mid);
		font-size: 0.85rem;
		cursor: pointer;
		transition: background 0.1s, color 0.1s;
	}

	.sidebar-logout:hover {
		background: rgba(255,255,255,0.08);
		color: #fff;
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

	/* ─── Mobile : la sidebar devient un tiroir latéral ─ */
	@media (max-width: 640px) {
		.menu-toggle,
		.top-upload { display: flex; }

		.app-shell {
			height: auto;
			min-height: 100vh;
			overflow: visible;
		}

		.app-top-bar {
			position: sticky;
			top: 0;
			padding: 0 0.7rem;
			gap: 0.6rem;
		}

		.group-select,
		.group-chip { max-width: 110px; }

		/* Upload, notifications et profil quittent le header pour une barre d'actions
		   fixée en bas — le header ne garde que le menu, le logo et le groupe actif.
		   Réordonné visuellement : profil à gauche, upload au centre, notifications
		   à droite (l'ordre du DOM, lui, reste celui du header desktop). */
		.top-actions {
			position: fixed;
			left: 0;
			right: 0;
			bottom: 0;
			z-index: 96;
			height: var(--footer-actions-h);
			padding: 0 1.2rem;
			background: var(--color-ink);
			border-top: 1px solid rgba(255,255,255,0.08);
			justify-content: space-around;
			gap: 0;
		}

		.top-actions .user-avatar { order: 1; }
		.top-actions .top-upload { order: 2; }
		.top-actions :global(.notif) { order: 3; }

		.app-body {
			flex-direction: column;
			overflow: visible;
		}

		/* Hors écran par défaut, glisse à l'ouverture du menu */
		.app-sidebar {
			position: fixed;
			top: 44px;
			bottom: 0;
			left: 0;
			width: 218px;
			z-index: 90;
			transform: translateX(-100%);
			transition: transform 0.18s ease-out;
			border-right: 1px solid rgba(255,255,255,0.08);
		}

		.app-sidebar.open {
			transform: none;
			box-shadow: 4px 0 20px rgba(0,0,0,0.3);
		}

		.nav-backdrop {
			display: block;
			position: fixed;
			inset: 44px 0 0;
			z-index: 80;
			background: rgba(0,0,0,0.45);
			border: none;
			padding: 0;
			cursor: default;
		}

		.sidebar-link { padding: 10px 10px; }

		.app-content { overflow-y: visible; }
	}

	@media (max-width: 400px) {
		.brand { gap: 0; }
		.brand span { display: none; }
	}

</style>
