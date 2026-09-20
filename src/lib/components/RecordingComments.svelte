<script lang="ts">
	import CommentList from '$lib/components/CommentList.svelte'
	import type { CommentWithReactions } from '$lib/types'

	let {
		recordingId,
		onSeek = null
	}: {
		recordingId: number
		/** Fourni uniquement quand un lecteur est ouvert sur la même prise. */
		onSeek?: ((seconds: number) => void) | null
	} = $props()

	/** Une ligne dépliée ne doit pas pousser les prises suivantes hors de l'écran. */
	const INLINE_MAX = 5

	let comments = $state<CommentWithReactions[]>([])
	let loading = $state(true)
	let loadError = $state<string | null>(null)

	function handleCommentsChange(updatedComments: CommentWithReactions[]) {
		comments = updatedComments
	}

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
		<!-- Ces listes servent à jeter un œil, pas à lire une discussion : au-delà de cinq,
		     les plus anciens se lisent dans le lecteur, où l'on peut aussi les écouter. -->
		<CommentList
			{comments}
			thread={{ kind: 'recording', id: recordingId }}
			{onSeek}
			compact
			maxVisible={INLINE_MAX}
			moreHref="/recording/{recordingId}"
			onCommentsChange={handleCommentsChange}
		/>
	{/if}
</div>

<style>
	/* Le retrait est celui du tiroir qui nous accueille (`row-drawer`) : on ne le double pas. */
	.inline-comments {
		padding: 0.1rem 0 0.35rem;
	}

	.inline-msg {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}

	.inline-msg.error { color: var(--color-error); }
</style>
