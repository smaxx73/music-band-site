<script lang="ts">
	import CommentList from '$lib/components/CommentList.svelte'
	import type { CommentWithReactions } from '$lib/types'

	let {
		recordingId
	}: {
		recordingId: number
	} = $props()

	let comments = $state<CommentWithReactions[]>([])
	let loading = $state(true)
	let loadError = $state<string | null>(null)

	// Le composant n'est monté que lorsque le panneau est déplié : le chargement
	// des commentaires reste à la demande, prise par prise.
	$effect(() => {
		const id = recordingId
		let cancelled = false

		loading = true
		loadError = null

		fetch(`/api/comments?recording_id=${id}`)
			.then(async (res) => {
				const json = await res.json()
				if (cancelled) return
				if (!res.ok) {
					loadError = json.error ?? 'Erreur.'
					return
				}
				comments = json as CommentWithReactions[]
			})
			.catch(() => {
				if (!cancelled) loadError = 'Erreur réseau.'
			})
			.finally(() => {
				if (!cancelled) loading = false
			})

		return () => { cancelled = true }
	})
</script>

<div class="inline-comments">
	{#if loading}
		<p class="inline-msg">Chargement des commentaires…</p>
	{:else if loadError}
		<p class="inline-msg error">{loadError}</p>
	{:else if comments.length === 0}
		<p class="inline-msg">Pas encore de commentaire.</p>
	{:else}
		<CommentList {comments} compact />
	{/if}
</div>

<style>
	.inline-comments {
		padding: 0.6rem 0.2rem 0.8rem;
	}

	.inline-msg {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}

	.inline-msg.error { color: var(--color-error); }
</style>
