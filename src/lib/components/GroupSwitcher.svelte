<!-- Groupe actif : son logo et son nom, et le changement de groupe. Posé en haut de la
     barre latérale (ordinateur, rail sur tablette) et dans la barre du haut au téléphone.
     Avec un seul groupe, il n'y a rien à choisir : c'est un lien vers la fiche du groupe. -->
<script lang="ts">
	import { page } from '$app/state'
	import Menu from '$lib/components/Menu.svelte'
	import Icon from '$lib/components/Icon.svelte'
	import { groupLogoUrl } from '$lib/types'
	import { switchActiveGroup } from '$lib/group-switch'

	type Group = { id: number; name: string; logo_version: number | null }

	let {
		groups,
		currentGroupId,
		variant
	}: {
		groups: Group[]
		currentGroupId: number | null
		/** `sidebar` : nom et mention « Groupe actif » ; `bar` : nom seul, barre du haut. */
		variant: 'sidebar' | 'bar'
	} = $props()

	let open = $state(false)
	let switching = $state(false)
	let error = $state<string | null>(null)

	const current = $derived(groups.find((g) => g.id === currentGroupId))

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

{#snippet identity(group: Group, withChevron: boolean)}
	{@render badge(group)}
	<span class="gs-text">
		<span class="gs-name">{group.name}</span>
		{#if variant === 'sidebar'}<span class="gs-sub">Groupe actif</span>{/if}
	</span>
	{#if withChevron}
		<Icon name={variant === 'sidebar' ? 'chevrons-up-down' : 'chevron-down'} class="gs-chevron" size="1rem" />
	{/if}
{/snippet}

{#if current && groups.length > 1}
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
				aria-label="Groupe actif : {current.name}. Changer de groupe"
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
				{#if group.id === currentGroupId}<Icon name="check" size="1rem" class="gs-check" />{/if}
			</button>
		{/each}
		<a href="/group" class="menu-item gs-info" role="menuitem" onclick={() => (open = false)}>
			Infos du groupe
			<Icon name="chevron-right" size="1rem" />
		</a>
		{#if error}<p class="message-error gs-error" role="alert">{error}</p>{/if}
	</Menu>
{:else if current}
	<a href="/group" class="gs-trigger gs-trigger-{variant}" aria-label="Groupe actif : {current.name}. Infos du groupe">
		{@render identity(current, false)}
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
