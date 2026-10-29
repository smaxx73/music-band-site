<!-- Groupe actif : son logo et son nom, et le changement de groupe. Posé en haut de la
     barre latérale (ordinateur, rail sur tablette) et dans la barre du haut au téléphone.
     L'espace perso s'y choisit comme un groupe, mais n'en est pas un : y aller ne change pas
     le groupe actif (le cookie `band_group` ne bouge pas), c'est une simple navigation vers
     `/perso`. Le menu existe donc dès qu'il y a un groupe, même seul. Sur `/perso`, deux
     coches : l'espace perso (où l'on est) et le groupe actif (celui des notifications, de
     « + Ajouter » et de la page où l'on reviendra). -->
<script lang="ts">
	import { page } from '$app/state'
	import { goto } from '$app/navigation'
	import Menu from '$lib/components/Menu.svelte'
	import Icon from '$lib/components/Icon.svelte'
	import Avatar from '$lib/components/Avatar.svelte'
	import { groupLogoUrl } from '$lib/types'
	import { switchActiveGroup } from '$lib/group-switch'

	type Group = { id: number; name: string; logo_version: number | null }

	type Me = { id: number; display_name: string; avatar_version: number | null }

	let {
		user,
		groups,
		currentGroupId,
		unreadByGroup = {},
		variant
	}: {
		/** Le compte connecté : l'espace perso s'affiche sous sa photo. */
		user: Me
		groups: Group[]
		currentGroupId: number | null
		/** Notifications non lues par id de groupe. */
		unreadByGroup?: Record<number, number>
		/** `sidebar` : nom et mention « Groupe actif » ; `bar` : nom seul, barre du haut. */
		variant: 'sidebar' | 'bar'
	} = $props()

	let open = $state(false)
	let switching = $state(false)
	let error = $state<string | null>(null)

	const current = $derived(groups.find((g) => g.id === currentGroupId))
	// Sur /perso, le groupe actif reste celui du cookie mais la page n'en dépend pas : le
	// déclencheur dit où l'on est. Sans aucun groupe, l'espace perso est le seul endroit.
	const inPerso = $derived(page.url.pathname === '/perso' || page.url.pathname.startsWith('/perso/'))
	const showPersonal = $derived(inPerso || !current)
	// Ce que le groupe actif a de non lu est déjà sur la cloche : seuls les autres comptent.
	const otherUnread = $derived(
		groups.reduce((n, g) => (g.id === currentGroupId ? n : n + (unreadByGroup[g.id] ?? 0)), 0)
	)

	function initials(name: string) {
		return name
			.split(/\s+/)
			.filter(Boolean)
			.map((word) => word[0])
			.join('')
			.slice(0, 2)
			.toUpperCase()
	}

	async function choose(groupId: number) {
		if (switching) return
		if (groupId === currentGroupId) {
			open = false
			// Revenir de l'espace perso au groupe qu'on n'a jamais quitté côté cookie.
			if (inPerso) await goto('/')
			return
		}
		switching = true
		error = null
		try {
			await switchActiveGroup(groupId, page.url.pathname)
		} catch (e) {
			error = e instanceof Error ? e.message : 'Le changement de groupe a échoué.'
			switching = false
		}
	}
</script>

{#snippet badge(group: Group)}
	{#if group.logo_version}
		<img src={groupLogoUrl(group.id, group.logo_version)} alt="" class="gs-badge" />
	{:else}
		<span class="gs-badge gs-initials" aria-hidden="true">{initials(group.name)}</span>
	{/if}
{/snippet}

{#snippet personalBadge(size: string)}
	<Avatar userId={user.id} name={user.display_name} version={user.avatar_version} {size} />
{/snippet}

{#snippet identity(group: Group | undefined, withChevron: boolean)}
	{#if showPersonal || !group}
		{@render personalBadge('30px')}
		<span class="gs-text">
			<span class="gs-name">Mon espace perso</span>
			{#if variant === 'sidebar'}<span class="gs-sub">Hors groupe</span>{/if}
		</span>
	{:else}
		{@render badge(group)}
		<span class="gs-text">
			<span class="gs-name">{group.name}</span>
			{#if variant === 'sidebar'}<span class="gs-sub">Groupe actif</span>{/if}
		</span>
	{/if}
	{#if withChevron}
		{#if otherUnread > 0}<span class="gs-dot" aria-hidden="true"></span>{/if}
		<Icon name={variant === 'sidebar' ? 'chevrons-up-down' : 'chevron-down'} class="gs-chevron" size="1rem" />
	{/if}
{/snippet}

{#if groups.length > 0}
	<Menu
		bind:open
		label="Changer de groupe"
		scrollIntoView={false}
		class="gs gs-{variant}"
		--menu-width="17rem"
		--menu-z="110"
	>
		{#snippet trigger(menu)}
			<button
				{...menu}
				type="button"
				class="gs-trigger gs-trigger-{variant}"
				aria-label="{showPersonal || !current ? 'Espace perso' : `Groupe actif : ${current.name}`}. Changer de groupe{otherUnread > 0 ? '. Notifications non lues dans un autre groupe' : ''}"
				aria-busy={switching}
			>
				{@render identity(current, true)}
			</button>
		{/snippet}

		<p class="gs-head">Changer de groupe</p>
		{#each groups as group (group.id)}
			<button
				type="button"
				class="menu-item"
				role="menuitemradio"
				aria-checked={group.id === currentGroupId}
				disabled={switching}
				onclick={() => choose(group.id)}
			>
				{@render badge(group)}
				<span class="gs-option">{group.name}</span>
				{#if group.id !== currentGroupId && unreadByGroup[group.id]}
					<span class="gs-unread" aria-label="{unreadByGroup[group.id]} non lues">
						{unreadByGroup[group.id] > 99 ? '99+' : unreadByGroup[group.id]}
					</span>
				{/if}
				{#if group.id === currentGroupId}<Icon name="check" size="1rem" class="gs-check" />{/if}
			</button>
		{/each}
		<a
			href="/perso"
			class="menu-item gs-perso"
			role="menuitemradio"
			aria-checked={inPerso}
			onclick={() => (open = false)}
		>
			{@render personalBadge('26px')}
			<span class="gs-option">Mon espace perso</span>
			{#if inPerso}<Icon name="check" size="1rem" class="gs-check" />{/if}
		</a>
		{#if current}
			<a href="/group" class="menu-item gs-info" role="menuitem" onclick={() => (open = false)}>
				Infos du groupe
				<Icon name="chevron-right" size="1rem" />
			</a>
		{/if}
		{#if error}<p class="message-error gs-error" role="alert">{error}</p>{/if}
	</Menu>
{:else}
	<a href="/perso" class="gs-trigger gs-trigger-{variant}" aria-label="Mon espace perso">
		{@render identity(undefined, false)}
	</a>
{/if}

<style>
	.gs-trigger {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		min-width: 0;
		min-height: 44px;
		padding: 0.3rem 0.5rem 0.3rem 0.3rem;
		border: none;
		border-radius: var(--radius-lg);
		background: transparent;
		color: #fff;
		font: inherit;
		text-align: left;
		text-decoration: none;
		cursor: pointer;
	}

	.gs-trigger:hover,
	.gs-trigger[aria-expanded='true'] { background: rgba(255,255,255,0.08); }

	/* Dans la barre latérale, c'est un bloc à part entière : cadre léger, toute la largeur.
	   Le conteneur du menu (`.gs-sidebar`) appartient à Menu.svelte. */
	:global(.gs-sidebar) { display: flex; width: 100%; }
	.gs-trigger-sidebar {
		width: 100%;
		border: 1px solid rgba(255,255,255,0.12);
		background: rgba(255,255,255,0.05);
	}

	.gs-text {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-width: 0;
		line-height: 1.2;
	}

	.gs-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.gs-trigger-bar .gs-name { font-size: var(--text-base); }

	.gs-sub {
		font-size: var(--text-2xs);
		color: var(--color-mid);
	}

	.gs-trigger :global(.gs-chevron) {
		flex-shrink: 0;
		color: var(--color-mid);
	}

	.gs-badge {
		width: 30px;
		height: 30px;
		flex-shrink: 0;
		border-radius: 50%;
		object-fit: cover;
		background: #fff;
	}

	.gs-initials {
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--color-ink);
		font-size: 0.7rem;
		font-weight: 700;
	}

	/* Dans le menu, sur fond clair : la pastille garde un contour pour ne pas s'y fondre. */
	.menu-item .gs-badge {
		width: 26px;
		height: 26px;
		box-shadow: inset 0 0 0 1px var(--color-border-light);
	}

	/* Pastille d'un groupe non ouvert : sur le déclencheur un simple point, dans le menu le compte. */
	.gs-dot {
		width: 9px;
		height: 9px;
		flex-shrink: 0;
		border-radius: 50%;
		background: var(--color-accent);
	}

	.gs-unread {
		min-width: 1.35rem;
		padding: 0.05rem 0.4rem;
		border-radius: 999px;
		background: var(--color-accent-dark);
		color: #fff;
		font-size: var(--text-2xs);
		font-weight: 700;
		line-height: 1.4;
		text-align: center;
	}

	.gs-head {
		margin: 0;
		padding: 0.4rem 0.6rem 0.25rem;
		font-size: var(--text-2xs);
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-text-muted);
	}

	.gs-option {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		font-weight: 600;
	}

	.menu-item[aria-checked='true'] { background: var(--color-accent-light); }
	.menu-item :global(.gs-check) { color: var(--color-accent-dark); }

	/* L'espace perso n'est pas un groupe : un filet le sépare de la liste. */
	.gs-perso {
		margin-top: 0.25rem;
		border-top: 1px solid var(--color-border-light);
		border-radius: 0;
	}

	.gs-info {
		justify-content: space-between;
		margin-top: 0.25rem;
		border-top: 1px solid var(--color-border-light);
		border-radius: 0;
		color: var(--color-accent-dark);
		font-weight: 600;
	}

	.gs-error { padding: 0.25rem 0.6rem 0.4rem; }
</style>
