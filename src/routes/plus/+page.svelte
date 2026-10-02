<!-- « Plus » : tout ce que la barre d'onglets du téléphone (et le rail de la tablette) ne
     porte pas — sections secondaires, changement de groupe, compte, pages légales. Le groupe
     actif, lui, est déjà dans la barre du haut : on ne le répète pas ici. -->
<script lang="ts">
	import type { PageData } from './$types'
	import { page } from '$app/state'
	import Icon from '$lib/components/Icon.svelte'
	import LegalLinks from '$lib/components/LegalLinks.svelte'
	import { groupLogoUrl, isAdmin } from '$lib/types'
	import { switchActiveGroup } from '$lib/group-switch'
	import { APP_VERSION } from '$lib/version'
	import type { IconName } from '$lib/icons'

	let { data }: { data: PageData } = $props()

	const user = $derived(data.user!)
	let switching = $state<number | null>(null)
	let switchError = $state<string | null>(null)

	async function choose(groupId: number) {
		if (switching !== null || groupId === user.current_group_id) return
		switching = groupId
		switchError = null
		try {
			await switchActiveGroup(groupId, page.url.pathname)
		} catch (e) {
			switchError = e instanceof Error ? e.message : 'Le changement de groupe a échoué.'
			switching = null
		}
	}

	type Entry = { href: string; label: string; icon: IconName }
	// Le tableau de bord a son onglet « Accueil » : le fil, sans onglet, passe en tête.
	// Les infos du groupe en dernier — on les consulte bien moins qu'on ne lit le fil.
	const groupEntries: Entry[] = [
		{ href: '/fil', label: "Fil d'actualité", icon: 'feed' },
		{ href: '/agenda', label: 'Agenda', icon: 'agenda' },
		{ href: '/playlists', label: 'Playlists', icon: 'playlist' },
		{ href: '/setlists', label: 'Setlists', icon: 'list' },
		{ href: '/group', label: 'Membres, lieux et réseaux', icon: 'users' },
	]
	const currentGroup = $derived(user.groups.find((g) => g.id === user.current_group_id))
	const otherGroups = $derived(user.groups.filter((g) => g.id !== user.current_group_id))
	const meEntries = $derived<Entry[]>([
		{ href: '/perso', label: 'Mon espace perso', icon: 'user' },
		{ href: '/profile', label: 'Mon profil', icon: 'settings' },
		...(isAdmin(user.role) ? [{ href: '/admin', label: 'Administration', icon: 'settings' } satisfies Entry] : []),
	])

	function initials(name: string) {
		return name.split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
	}
</script>

<svelte:head>
	<title>Plus</title>
</svelte:head>

{#snippet entries(list: Entry[])}
	<ul class="entries">
		{#each list as entry (entry.href)}
			<li>
				<a href={entry.href} class="entry">
					<Icon name={entry.icon} size="1.2rem" class="entry-icon" />
					<span>{entry.label}</span>
					<Icon name="chevron-right" size="1rem" class="entry-chevron" />
				</a>
			</li>
		{/each}
	</ul>
{/snippet}

<main class="page page-narrow">
	<h1 class="title">Plus</h1>

	{#if user.current_group_id}
		<section aria-labelledby="plus-group-nav">
			<h2 id="plus-group-nav" class="section-title">{currentGroup?.name ?? 'Groupe'}</h2>
			{@render entries(groupEntries)}
		</section>
	{/if}

	{#if otherGroups.length > 0}
		<section aria-labelledby="plus-groups">
			<h2 id="plus-groups" class="section-title">
				{user.current_group_id ? 'Changer de groupe' : 'Choisir un groupe'}
			</h2>
			<ul class="groups">
				{#each otherGroups as group (group.id)}
					<li>
						<button
							type="button"
							class="group"
							aria-busy={switching === group.id}
							disabled={switching !== null}
							onclick={() => choose(group.id)}
						>
							{#if group.logo_version}
								<img src={groupLogoUrl(group.id, group.logo_version)} alt="" class="badge" />
							{:else}
								<span class="badge initials" aria-hidden="true">{initials(group.name)}</span>
							{/if}
							<span class="group-name">{group.name}</span>
							<Icon name="chevron-right" size="1rem" class="entry-chevron" />
						</button>
					</li>
				{/each}
			</ul>
			{#if switchError}<p class="message-error" role="alert">{switchError}</p>{/if}
		</section>
	{/if}

	<section aria-labelledby="plus-me">
		<h2 id="plus-me" class="section-title">Moi</h2>
		{@render entries(meEntries)}
		<form method="POST" action="/logout">
			<button type="submit" class="entry logout">
				<Icon name="power" size="1.2rem" class="entry-icon" />
				<span>Se déconnecter</span>
			</button>
		</form>
	</section>

	<footer class="foot">
		<LegalLinks compact />
		<span>BandStash · v{APP_VERSION}</span>
	</footer>
</main>

<style>
	.title {
		margin: 0 0 1rem;
		font-size: var(--text-xl);
	}

	section + section { margin-top: 1.5rem; }

	.section-title {
		margin: 0 0.5rem 0.35rem;
		font-size: var(--text-2xs);
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-text-muted);
	}

	.groups,
	.entries {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.group {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		width: 100%;
		min-height: 52px;
		padding: 0.25rem 0.5rem;
		border: none;
		border-bottom: 1px solid var(--color-bg-muted);
		background: transparent;
		color: var(--color-text);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.group:hover { background: var(--color-bg-subtle); }
	.group :global(.entry-chevron) { color: var(--color-mid); }

	.badge {
		width: 34px;
		height: 34px;
		flex-shrink: 0;
		border-radius: 50%;
		object-fit: cover;
		background: var(--color-ink);
	}

	.initials {
		display: flex;
		align-items: center;
		justify-content: center;
		color: #fff;
		font-size: var(--text-xs);
		font-weight: 700;
	}

	.group-name {
		flex: 1;
		min-width: 0;
		font-weight: 600;
	}

	.entry {
		display: flex;
		align-items: center;
		gap: 0.85rem;
		width: 100%;
		min-height: 48px;
		padding: 0 0.5rem;
		border: none;
		border-bottom: 1px solid var(--color-bg-muted);
		background: none;
		color: var(--color-text);
		font: inherit;
		text-align: left;
		text-decoration: none;
		cursor: pointer;
	}

	.entry:hover { background: var(--color-bg-subtle); }
	.entry > span { flex: 1; }
	.entry :global(.entry-icon) { color: var(--color-text-secondary); }
	.entry :global(.entry-chevron) { color: var(--color-mid); }

	.logout { border-bottom: none; color: var(--color-text-secondary); }

	.foot {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin-top: 2rem;
		padding: 0 0.5rem;
		font-size: var(--text-xs);
		color: var(--color-text-muted);
	}
</style>
