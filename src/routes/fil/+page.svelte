<script lang="ts">
	import type { PageData } from './$types'
	import { untrack } from 'svelte'
	import { invalidateAll, replaceState } from '$app/navigation'
	import { page } from '$app/state'
	import FeedItem from '$lib/components/FeedItem.svelte'
	import PublishDialog, { type PublishChoice } from '$lib/components/PublishDialog.svelte'
	import type { MentionMember } from '$lib/components/MentionTextarea.svelte'
	import { player } from '$lib/player.svelte'
	import type { FeedItem as FeedItemData, FeedPage } from '$lib/types'
	import Icon from '$lib/components/Icon.svelte'

	let { data }: { data: PageData } = $props()

	const feed = $derived(data.feed as unknown as FeedPage)
	const members = $derived(data.groupMembers as unknown as MentionMember[])
	const publishChoices = $derived(data.publishChoices as unknown as PublishChoice[])

	// ─── Vue ───────────────────────────────────────────────────────────────
	// Dans l'URL (`?vue=`) : rendue par le serveur, partageable, et « Commentaires » du
	// tableau de bord y mène directement.
	const VIEWS = [
		{ id: 'all', param: null, label: 'Tout' },
		{ id: 'news', param: 'nouveautes', label: 'Nouveautés' },
		{ id: 'comments', param: 'commentaires', label: 'Commentaires' },
	] as const
	const view = $derived(data.view as (typeof VIEWS)[number]['id'])
	const viewParam = $derived(VIEWS.find((v) => v.id === view)?.param ?? null)

	function viewHref(param: string | null) {
		return param ? `/fil?vue=${param}` : '/fil'
	}

	const emptyText = $derived(
		view === 'comments'
			? 'Aucun commentaire pour l’instant. Ceux des prises, des setlists et des publications apparaîtront ici.'
			: 'Rien pour l’instant. Une session, une prise ou une publication apparaîtra ici.'
	)

	// ─── Publier ───────────────────────────────────────────────────────────
	// Sur place : on publie là où la publication va apparaître, sans passer par l'espace perso.
	let publishOpen = $state(false)

	// `/fil?publier` : « Publier » du menu Ajouter et du tableau de bord arrive ici,
	// formulaire ouvert. Suivi sur l'URL, pas au montage : le menu y mène aussi depuis
	// le fil lui-même, sans remonter la page.
	$effect(() => {
		if (!page.url.searchParams.has('publier')) return
		untrack(() => {
			publishOpen = true
			// Retiré de l'URL : un rechargement ne doit pas rouvrir le formulaire.
			const url = new URL(page.url)
			url.searchParams.delete('publier')
			replaceState(url, page.state)
		})
	})

	async function onPublished() {
		publishOpen = false
		// La publication ouvre le fil : on recharge la première page et on y remonte.
		await invalidateAll()
		window.scrollTo({ top: 0, behavior: 'smooth' })
	}

	// $derived inscriptibles : « Charger plus » les prolonge, un rechargement les remet à zéro.
	let items = $derived<FeedItemData[]>(feed.items)
	let next = $derived<string | null>(feed.next)
	let loading = $state(false)
	let loadError = $state<string | null>(null)

	async function loadMore() {
		if (!next || loading) return
		loading = true
		loadError = null
		try {
			const params = new URLSearchParams({ before: next })
			if (data.user?.current_group_id) params.set('group_id', String(data.user.current_group_id))
			if (viewParam) params.set('vue', viewParam)
			const res = await fetch(`/api/feed?${params}`)
			const json = await res.json().catch(() => ({}))
			// Un autre onglet a changé de groupe : la suite serait celle d'un autre fil.
			if (res.status === 409) { await invalidateAll(); return }
			if (!res.ok) { loadError = json.error ?? `Erreur ${res.status}`; return }
			const page = json as FeedPage
			// Un élément peut avoir glissé d'une page à l'autre entre deux chargements
			// (une prise ajoutée à une série du jour la fait remonter) : pas de doublon.
			const known = new Set(items.map((i) => i.key))
			items = [...items, ...page.items.filter((i) => !known.has(i.key))]
			next = page.next
		} catch {
			loadError = 'Erreur réseau.'
		} finally {
			loading = false
		}
	}

	// Un seul lecteur à la fois : un enregistrement lancé dans le fil coupe les autres et
	// la barre du bas ; une prise lancée dans la barre du bas coupe le fil.
	let feedEl = $state<HTMLElement | null>(null)

	function onFeedPlay(event: Event) {
		const target = event.target
		if (!(target instanceof HTMLMediaElement)) return
		if (player.isPlaying) player.pause()
		feedEl?.querySelectorAll('audio').forEach((audio) => {
			if (audio !== target) audio.pause()
		})
	}

	$effect(() => {
		if (!player.isPlaying) return
		feedEl?.querySelectorAll('audio').forEach((audio) => audio.pause())
	})
</script>

<svelte:head>
	<title>Fil d'actualité</title>
</svelte:head>

<main class="page page-narrow">
	<div class="page-header">
		<h1>Fil d'actualité</h1>
		<button class="btn btn-primary" onclick={() => (publishOpen = true)}><Icon name="plus" /> Publier</button>
	</div>

	<!-- Des liens, pas des boutons : chaque vue a son adresse. Ni défilement ni entrée
	     d'historique : on bascule une vue, on ne change pas de page. -->
	<nav class="view-switch" aria-label="Contenu du fil">
		{#each VIEWS as v (v.id)}
			<a
				href={viewHref(v.param)}
				aria-current={view === v.id ? 'page' : undefined}
				data-sveltekit-noscroll
				data-sveltekit-replacestate
			>{v.label}</a>
		{/each}
	</nav>

	{#if items.length === 0}
		<p class="empty">{emptyText}</p>
	{:else}
		<div class="feed" bind:this={feedEl} onplaycapture={onFeedPlay}>
			{#each items as item (item.key)}
				<FeedItem {item} {members} />
			{/each}
		</div>

		{#if loadError}<p class="message-error">{loadError}</p>{/if}

		{#if next}
			<div class="more">
				<button class="btn btn-secondary" onclick={loadMore} disabled={loading}>
					{loading ? 'Chargement…' : 'Charger plus'}
				</button>
			</div>
		{:else}
			<p class="end">Vous êtes arrivé au début du fil.</p>
		{/if}
	{/if}

	{#if publishOpen}
		<PublishDialog
			groupName={data.groupName as string}
			recordings={publishChoices}
			onClose={() => (publishOpen = false)}
			{onPublished}
		/>
	{/if}
</main>

<style>
	.view-switch {
		display: inline-flex;
		margin-bottom: var(--space-4);
		border: 1px solid var(--color-border-light);
		border-radius: var(--radius-pill);
		overflow: hidden;
	}

	.view-switch a {
		display: inline-flex;
		align-items: center;
		min-height: 32px;
		padding: 0.25rem 0.85rem;
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		text-decoration: none;
	}

	.view-switch a:hover { background: var(--color-bg-muted); }

	.view-switch a[aria-current='page'] {
		background: var(--color-accent-light);
		color: var(--color-accent-dark);
		font-weight: 600;
	}

	.feed { display: flex; flex-direction: column; gap: var(--space-4); }

	.more { display: flex; justify-content: center; margin-top: var(--space-5); }

	.empty, .end {
		text-align: center;
		color: var(--color-text-muted);
		font-size: var(--text-sm);
	}
	.end { margin-top: var(--space-5); }

	@media (max-width: 640px) {
		.feed { gap: var(--space-3); }
	}
</style>
