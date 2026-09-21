<script lang="ts">
	import type { PageData } from './$types'
	import { onMount } from 'svelte'
	import { invalidateAll, replaceState } from '$app/navigation'
	import { page } from '$app/state'
	import FeedItem from '$lib/components/FeedItem.svelte'
	import PublishDialog, { type PublishChoice } from '$lib/components/PublishDialog.svelte'
	import type { MentionMember } from '$lib/components/MentionTextarea.svelte'
	import { player } from '$lib/player.svelte'
	import type { FeedItem as FeedItemData, FeedPage } from '$lib/types'

	let { data }: { data: PageData } = $props()

	const feed = $derived(data.feed as unknown as FeedPage)
	const members = $derived(data.groupMembers as unknown as MentionMember[])
	const publishChoices = $derived(data.publishChoices as unknown as PublishChoice[])

	// ─── Publier ───────────────────────────────────────────────────────────
	// Sur place : on publie là où la publication va apparaître, sans passer par l'espace perso.
	let publishOpen = $state(false)

	// `/fil?publier` : le « + Publier » du tableau de bord arrive ici, formulaire ouvert.
	onMount(() => {
		if (!page.url.searchParams.has('publier')) return
		publishOpen = true
		// Retiré de l'URL : un rechargement ne doit pas rouvrir le formulaire.
		const url = new URL(page.url)
		url.searchParams.delete('publier')
		replaceState(url, page.state)
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

<main>
	<div class="header">
		<h1>Fil d'actualité</h1>
		<button class="btn btn-primary btn-sm" onclick={() => (publishOpen = true)}>+ Publier</button>
	</div>

	{#if items.length === 0}
		<p class="empty">Rien pour l'instant. Une session, une prise ou une publication apparaîtra ici.</p>
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
	main { max-width: 640px; margin: 2rem auto; padding: 0 1rem; }

	.header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1.5rem; }
	h1 { font-size: var(--text-xl); margin: 0; }

	.feed { display: flex; flex-direction: column; gap: var(--space-4); }

	.more { display: flex; justify-content: center; margin-top: var(--space-5); }

	.empty, .end {
		text-align: center;
		color: var(--color-text-muted);
		font-size: var(--text-sm);
	}
	.end { margin-top: var(--space-5); }

	@media (max-width: 640px) {
		main { margin: 1rem auto; padding: 0 0.75rem; }
		.feed { gap: var(--space-3); }
	}
</style>
