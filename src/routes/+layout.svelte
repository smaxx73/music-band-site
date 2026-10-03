<script lang="ts">
	import '../app.css'
	import type { LayoutData } from './$types'
	import { page, updated } from '$app/state'
	import { onMount } from 'svelte'
	import { isAdmin } from '$lib/types'
	import MiniPlayer from '$lib/components/MiniPlayer.svelte'
	import NotificationsMenu from '$lib/components/NotificationsMenu.svelte'
	import GroupSwitcher from '$lib/components/GroupSwitcher.svelte'
	import AddMenu from '$lib/components/AddMenu.svelte'
	import Icon from '$lib/components/Icon.svelte'
	import LegalLinks from '$lib/components/LegalLinks.svelte'
	import { APP_VERSION } from '$lib/version'
	import type { IconName } from '$lib/icons'

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props()

	// Fermeture locale ; une nouvelle annonce du serveur réaffiche le bandeau.
	let groupSwitchNotice = $derived(data.group_switched_to)

	// Fermé, le bandeau de mise à jour ne revient pas dans cet onglet : actualiser coupe
	// la lecture en cours et un formulaire entamé, c'est au membre de choisir son moment.
	let updateNoticeDismissed = $state(false)

	// Le cookie du groupe est commun aux onglets. Au retour dans cet onglet, on
	// recharge l'ensemble de la page si un autre onglet l'a changé.
	onMount(() => {
		let checking = false
		async function checkActiveGroup() {
			if (!data.user || checking || document.visibilityState !== 'visible') return
			checking = true
			try {
				const response = await fetch('/api/groups/switch', { cache: 'no-store' })
				if (!response.ok) return
				const { group_id } = await response.json()
				if (group_id !== data.user?.current_group_id) location.reload()
			} catch {
				// Hors ligne : le prochain retour dans l'onglet réessaiera.
			} finally {
				checking = false
			}
		}
		// Un onglet en arrière-plan voit ses minuteries ralenties, voire suspendues sur
		// téléphone : le retour dans l'onglet vérifie la version sans attendre le prochain tour.
		function checkUpdate() {
			if (document.visibilityState === 'visible' && !updated.current) updated.check()
		}
		window.addEventListener('focus', checkActiveGroup)
		document.addEventListener('visibilitychange', checkActiveGroup)
		document.addEventListener('visibilitychange', checkUpdate)
		return () => {
			window.removeEventListener('focus', checkActiveGroup)
			document.removeEventListener('visibilitychange', checkActiveGroup)
			document.removeEventListener('visibilitychange', checkUpdate)
		}
	})

	function isActive(prefix: string) {
		if (prefix === '/') return page.url.pathname === '/'
		return page.url.pathname === prefix || page.url.pathname.startsWith(prefix + '/')
	}

	// « page » sur la page même, « true » dans sa section (une session sous Sessions).
	function ariaCurrent(prefix: string, section = [prefix]): 'page' | 'true' | undefined {
		if (page.url.pathname === prefix) return 'page'
		return section.some(isActive) ? 'true' : undefined
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

	type NavItem = { href: string; label: string; short: string; icon: IconName }

	// Barre latérale (ordinateur) et rail (tablette) : `short` est le libellé du rail,
	// trop étroit pour « Tableau de bord ».
	const groupNav: NavItem[] = [
		{ href: '/', label: 'Tableau de bord', short: 'Accueil', icon: 'home' },
		{ href: '/fil', label: "Fil d'actualité", short: 'Fil', icon: 'feed' },
		{ href: '/sessions', label: 'Sessions', short: 'Sessions', icon: 'calendar' },
		{ href: '/agenda', label: 'Agenda', short: 'Agenda', icon: 'agenda' },
		{ href: '/songs', label: 'Morceaux', short: 'Morceaux', icon: 'music' },
		{ href: '/playlists', label: 'Playlists', short: 'Playlists', icon: 'playlist' },
		{ href: '/setlists', label: 'Setlists', short: 'Setlists', icon: 'list' },
	]
	// Hors groupe : l'espace perso suit l'utilisateur quel que soit le groupe actif.
	const meNav: NavItem[] = [
		{ href: '/perso', label: 'Mon espace perso', short: 'Perso', icon: 'user' },
	]

	// Barre d'onglets (téléphone) : ce qu'on ouvre en répétition, le reste sous « Plus ».
	// Chaque onglet s'allume aussi sur les pages qu'il contient (une prise est sous Sessions).
	type Tab = { href: string; label: string; icon: IconName; section: string[] }
	const tabsBefore: Tab[] = [
		{ href: '/', label: 'Accueil', icon: 'home', section: ['/'] },
		{ href: '/sessions', label: 'Sessions', icon: 'calendar', section: ['/sessions', '/recording'] },
	]
	const tabsAfter: Tab[] = [
		{ href: '/songs', label: 'Morceaux', icon: 'music', section: ['/songs'] },
		{
			href: '/plus',
			label: 'Plus',
			icon: 'grid',
			section: ['/plus', '/fil', '/agenda', '/playlists', '/setlists', '/perso', '/posts', '/group', '/profile', '/admin'],
		},
	]
</script>

<svelte:head>
	<link rel="icon" type="image/svg+xml" href="/brand/bandstash-mark-simple.svg" />
	<meta name="application-name" content="BandStash" />
</svelte:head>

{#snippet navLink(item: NavItem)}
	<li>
		<a href={item.href} class="sidebar-link" class:active={isActive(item.href)} aria-current={ariaCurrent(item.href)}>
			<Icon name={item.icon} class="nav-icon" size="1rem" />
			<span class="nav-label">{item.label}</span>
			<span class="nav-short" aria-hidden="true">{item.short}</span>
		</a>
	</li>
{/snippet}

{#snippet tab(item: Tab)}
	<a href={item.href} class="tab" aria-current={ariaCurrent(item.href, item.section)}>
		<span class="tab-pill"><Icon name={item.icon} size="1.35rem" /></span>
		{item.label}
	</a>
{/snippet}

{#if data.user}
	<div class="app-shell">
		<header class="app-top-bar">
			<a href="/" class="brand" class:brand-always={!currentGroup} aria-label="BandStash — tableau de bord">
				<img src="/brand/bandstash-mark-simple.svg" alt="" class="brand-mark" />
				<!-- Version en service : c'est elle qu'on cite pour signaler un souci. -->
				<span class="brand-text">
					<span class="brand-name">BandStash</span>
					<span class="brand-version">v{APP_VERSION}</span>
				</span>
			</a>
			<!-- Au téléphone, la barre latérale n'existe plus : le groupe actif prend la
			     place du logo, à gauche de la barre du haut. -->
			<div class="bar-group">
				<GroupSwitcher groups={data.user.groups} currentGroupId={data.user.current_group_id} variant="bar" />
			</div>
			<div class="top-spacer"></div>
			{#if data.user.current_group_id}
				<!-- Recréé à chaque bascule de groupe : liste, pastille locale et requêtes en
				     vol appartiennent au groupe précédent et ne doivent pas lui survivre. -->
				{#key data.user.current_group_id}
					<NotificationsMenu
						groupId={data.user.current_group_id}
						initialUnread={data.unread_notifications ?? 0}
					/>
				{/key}
			{/if}
			<a
				href="/profile"
				class="user-avatar"
				class:active={isActive('/profile')}
				aria-current={ariaCurrent('/profile')}
				title="{data.user.display_name} — mon profil"
			>{userInitials}</a>
		</header>

		<div class="app-body">
			<!-- Ordinateur : barre latérale complète. Tablette : rail d'icônes. Téléphone :
			     masquée, remplacée par la barre d'onglets du bas. -->
			<nav class="app-sidebar" aria-label="Navigation principale">
				<div class="sidebar-group">
					<GroupSwitcher groups={data.user.groups} currentGroupId={data.user.current_group_id} variant="sidebar" />
				</div>
				<div class="sidebar-add">
					<AddMenu variant="sidebar" hasGroup={!!data.user.current_group_id} />
				</div>

				<!-- Seule cette partie défile : le groupe et « Ajouter », au-dessus, ouvrent des
				     menus qui débordent sur la page, et un conteneur qui défile les couperait. -->
				<div class="sidebar-scroll">
					<p class="sidebar-section" id="nav-group">Groupe</p>
					<ul class="sidebar-nav" aria-labelledby="nav-group">
						{#each groupNav as item (item.href)}{@render navLink(item)}{/each}
					</ul>
					<p class="sidebar-section" id="nav-me">Moi</p>
					<ul class="sidebar-nav" aria-labelledby="nav-me">
						{#each meNav as item (item.href)}{@render navLink(item)}{/each}
					</ul>

					<div class="sidebar-spacer"></div>

					<!-- Le rail n'a pas la place du compte ni des liens légaux : ils sont sous « Plus ». -->
					<ul class="sidebar-nav rail-only">
						{@render navLink({ href: '/plus', label: 'Plus', short: 'Plus', icon: 'grid' })}
					</ul>

					<div class="full-only">
						{#if isAdmin(data.user?.role)}
							<ul class="sidebar-nav">
								{@render navLink({ href: '/admin', label: 'Admin', short: 'Admin', icon: 'settings' })}
							</ul>
						{/if}

						<div class="sidebar-account">
							<a href="/profile" class="sidebar-user" class:active={isActive('/profile')} aria-current={ariaCurrent('/profile')}>
								<div class="sidebar-avatar">{userInitials}</div>
								<span class="sidebar-username">{data.user.display_name}</span>
							</a>
							<form method="POST" action="/logout">
								<button type="submit" class="sidebar-logout" title="Se déconnecter">
									<Icon name="power" size="0.95rem" label="Se déconnecter" />
								</button>
							</form>
						</div>

						<div class="sidebar-legal">
							<LegalLinks compact />
						</div>
					</div>
				</div>
			</nav>

			<div class="app-content">
				{#if updated.current && !updateNoticeDismissed}
					<!-- L'application chargée dans l'onglet n'est plus celle du serveur : ses
					     liens peuvent viser des fichiers qui n'existent plus. -->
					<div class="app-banner" role="status">
						<span>
							Une nouvelle version de BandStash est en ligne.
							<button type="button" class="btn-link" onclick={() => location.reload()}>Actualiser la page</button>
						</span>
						<button
							type="button"
							class="app-banner-close"
							aria-label="Fermer le bandeau de mise à jour"
							title="Fermer"
							onclick={() => (updateNoticeDismissed = true)}
						>
							<Icon name="close" size="1rem" />
						</button>
					</div>
				{/if}
				{#if groupSwitchNotice}
					<!-- Un lien reçu visait un autre groupe : la bascule a déjà eu lieu, mais
					     elle vaut pour tous les onglets — la taire serait plus déroutant. -->
					<div class="app-banner">
						<span>Groupe actif basculé sur <strong>{groupSwitchNotice}</strong> pour ouvrir ce lien.</span>
						<button
							type="button"
							class="app-banner-close"
							aria-label="Fermer le bandeau de changement de groupe"
							title="Fermer"
							onclick={() => (groupSwitchNotice = null)}
						>
							<Icon name="close" size="1rem" />
						</button>
					</div>
				{/if}
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

		<nav class="tab-bar" aria-label="Navigation principale">
			{#each tabsBefore as item (item.href)}{@render tab(item)}{/each}
			<div class="tab-add">
				<AddMenu variant="tab" hasGroup={!!data.user.current_group_id} />
			</div>
			{#each tabsAfter as item (item.href)}{@render tab(item)}{/each}
		</nav>
	</div>
{:else}
	{@render children()}
{/if}

<style>
	/* Trois mises en page, réglées ici seules :
	   - ordinateur (≥ 1024 px) : barre latérale complète, en sections ;
	   - tablette (641–1023 px) : rail d'icônes à court libellé, qui rend la largeur au contenu ;
	   - téléphone (≤ 640 px) : barre d'onglets en bas, groupe actif dans la barre du haut. */

	/* ─── Barre du haut ──────────────────────────── */
	.brand {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 700;
		font-size: var(--text-base);
		color: #fff;
		text-decoration: none;
		white-space: nowrap;
		flex-shrink: 0;
		letter-spacing: -0.01em;
	}

	.brand-text {
		display: flex;
		flex-direction: column;
		line-height: 1.1;
	}
	.brand-version {
		font-size: var(--text-2xs);
		font-weight: 400;
		letter-spacing: 0;
		color: rgba(255,255,255,0.45);
		font-variant-numeric: tabular-nums;
	}
	.brand-mark {
		width: 30px;
		height: 30px;
		object-fit: contain;
		flex-shrink: 0;
	}

	.bar-group { display: none; min-width: 0; }

	.top-spacer { flex: 1; }

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

	/* ─── Barre latérale ─────────────────────────── */
	/* Au-dessus du contenu, que ses menus recouvrent. */
	.app-sidebar {
		overflow: visible;
		z-index: 20;
	}

	.sidebar-scroll {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		overflow-y: auto;
		width: 100%;
	}

	.sidebar-group { margin-bottom: 10px; }
	.sidebar-add { margin-bottom: 6px; }

	.sidebar-section {
		margin: 12px 10px 4px;
		font-size: var(--text-2xs);
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-mid);
	}

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
		font-size: var(--text-sm);
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

	/* L'icône est rendue par Icon.svelte : le style scopé ne l'atteint qu'en passant
	   par `:global`, gardé sous `.sidebar-link` pour ne pas devenir une règle globale. */
	.sidebar-link :global(.nav-icon) {
		opacity: 0.85;
		flex-shrink: 0;
	}

	.nav-short,
	.rail-only { display: none; }

	.sidebar-spacer { flex: 1; }

	.sidebar-account {
		display: flex;
		align-items: center;
		gap: 4px;
		margin-top: 6px;
		border-top: 1px solid rgba(255,255,255,0.08);
	}

	.sidebar-legal {
		padding: 0.25rem 12px 0.5rem;
		color: rgba(255,255,255,0.45);
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
		border-radius: var(--radius-lg);
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
		border-radius: var(--radius-lg);
		color: var(--color-mid);
		font-size: var(--text-sm);
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
		font-size: var(--text-xs);
		color: var(--color-mid);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* ─── Barre d'onglets (téléphone) ────────────── */
	.tab-bar { display: none; }

	/* ─── Bandeaux d'information (bascule de groupe, mise à jour) ─ */
	.app-banner {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		background: var(--color-bg-subtle);
		border-bottom: 1px solid var(--color-border);
		padding: 0.5rem 1rem;
		font-size: var(--text-sm);
		text-align: center;
		color: var(--color-text-muted);
	}

	.app-banner strong { color: var(--color-text); }
	.app-banner > span { flex: 1; min-width: 0; overflow-wrap: anywhere; }

	.app-banner-close {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 32px;
		height: 32px;
		padding: 0;
		border: none;
		border-radius: var(--radius-md);
		background: transparent;
		color: inherit;
		cursor: pointer;
	}

	.app-banner-close:hover { background: var(--color-border); color: var(--color-text); }
	.app-banner-close:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }

	/* ─── No-group banner ────────────────────────── */
	.no-group-banner {
		background: var(--color-warning-bg);
		border-bottom: 1px solid var(--color-warning-border);
		padding: 0.5rem 1rem;
		font-size: var(--text-sm);
		text-align: center;
		color: var(--color-warning-text);
	}

	.no-group-banner a {
		color: inherit;
		font-weight: 600;
	}

	/* ─── Tablette : la barre latérale devient un rail ─ */
	@media (min-width: 641px) and (max-width: 1023px) {
		.app-sidebar {
			width: 76px;
			align-items: center;
			padding: 10px 6px;
		}

		.sidebar-section,
		.full-only { display: none; }

		/* Le libellé complet reste le nom du lien pour les lecteurs d'écran ; à l'œil,
		   c'est le court qui s'affiche sous l'icône. */
		.nav-label {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip-path: inset(50%);
			white-space: nowrap;
		}

		.rail-only,
		.nav-short { display: flex; }

		.sidebar-nav { width: 100%; }

		.sidebar-link {
			flex-direction: column;
			gap: 3px;
			padding: 6px 0;
			font-size: var(--text-2xs);
			text-align: center;
		}

		.sidebar-link.active {
			background: rgba(226, 94, 54, 0.22);
			color: #fff;
			font-weight: 600;
		}

		.sidebar-link.active :global(.nav-icon) { color: var(--color-accent); opacity: 1; }

		/* Le groupe se réduit à sa pastille, l'ajout à son « + ». Leur nom reste dans
		   l'`aria-label` du bouton. */
		.sidebar-group :global(.gs-text),
		.sidebar-group :global(.gs-chevron),
		.sidebar-add :global(.add-label) { display: none; }

		.sidebar-group :global(.gs-trigger) {
			justify-content: center;
			padding: 4px;
			border: none;
			background: transparent;
		}

		.sidebar-group :global(.gs-trigger .gs-badge) {
			width: 40px;
			height: 40px;
			box-shadow: 0 0 0 2px var(--color-accent);
		}

		/* Le conteneur du menu prend toute la largeur du rail (le panneau s'y ancre) :
		   c'est lui qui centre le bouton. Rond, comme au centre de la barre d'onglets. */
		.sidebar-add { width: 100%; }
		.sidebar-add :global(.add-menu-sidebar) { justify-content: center; }

		.sidebar-add :global(.add-trigger-sidebar) {
			width: 44px;
			height: 44px;
			min-height: 0;
			border-radius: 50%;
			box-shadow: 0 4px 12px rgba(226, 94, 54, 0.35);
		}

		.sidebar-add :global(.add-trigger-sidebar svg) { width: 1.35rem; height: 1.35rem; }
	}

	/* ─── Téléphone : barre d'onglets en bas ─────── */
	@media (max-width: 640px) {
		.app-top-bar {
			padding: 0 0.4rem 0 0.6rem;
			gap: 0.4rem;
		}

		.brand:not(.brand-always),
		.user-avatar,
		.app-sidebar { display: none; }

		.bar-group { display: flex; }

		.app-body { flex-direction: column; }

		.tab-bar {
			position: fixed;
			left: 0;
			right: 0;
			bottom: 0;
			z-index: 96;
			height: var(--footer-actions-h);
			display: grid;
			grid-template-columns: repeat(5, minmax(0, 1fr));
			align-items: center;
			padding: 0 0.25rem;
			background: var(--color-ink);
			border-top: 1px solid rgba(255,255,255,0.08);
		}

		.tab {
			display: flex;
			flex-direction: column;
			align-items: center;
			gap: 2px;
			min-height: 48px;
			justify-content: center;
			color: var(--color-mid);
			font-size: var(--text-2xs);
			font-weight: 500;
			text-decoration: none;
		}

		.tab-pill {
			display: flex;
			align-items: center;
			justify-content: center;
			width: 52px;
			height: 28px;
			border-radius: var(--radius-pill);
		}

		.tab[aria-current] { color: #fff; font-weight: 600; }
		.tab[aria-current] .tab-pill {
			background: rgba(226, 94, 54, 0.28);
			color: var(--color-accent);
		}

		.tab-add { display: flex; justify-content: center; }
	}
</style>
