<script lang="ts">
	import { tick } from 'svelte'
	import CommentList from '$lib/components/CommentList.svelte'
	import type { CommentWithReactions } from '$lib/types'

	type HighlightRequest = {
		id: number
		token: number
	}

	let {
		recordingId,
		comments,
		currentTime = 0,
		playerReady = false,
		isPlaying = false,
		highlightRequest = null,
		onSeek = () => {},
		onCommentsChange = () => {}
	}: {
		recordingId: number
		comments: CommentWithReactions[]
		currentTime?: number
		playerReady?: boolean
		isPlaying?: boolean
		highlightRequest?: HighlightRequest | null
		onSeek?: (seconds: number) => void
		onCommentsChange?: (comments: CommentWithReactions[]) => void
	} = $props()

	// $derived inscriptible : ajout optimiste local, resynchronisé dès que le parent change
	let displayComments = $derived(comments)
	let content = $state('')
	let anchorTimestamp = $state(false)
	let submitting = $state(false)
	let formError = $state<string | null>(null)
	let lastHighlightToken = $state<number | null>(null)
	let list = $state<ReturnType<typeof CommentList> | null>(null)

	function formatTime(s: number) {
		if (!isFinite(s)) return '0:00'
		const m = Math.floor(s / 60)
		const sec = Math.floor(s % 60)
		return `${m}:${String(sec).padStart(2, '0')}`
	}

	async function submitComment(event: SubmitEvent) {
		event.preventDefault()
		formError = null

		if (!content.trim()) {
			formError = 'Le commentaire est vide.'
			return
		}

		const ts = anchorTimestamp && isFinite(currentTime) && currentTime > 0
			? currentTime
			: null

		submitting = true
		try {
			const res = await fetch('/api/comments', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					recording_id: recordingId,
					content: content.trim(),
					timestamp_s: ts
				})
			})
			const json = await res.json()
			if (!res.ok) {
				formError = json.error ?? 'Erreur.'
				return
			}

			const updatedComments = [...displayComments, json as CommentWithReactions]
			displayComments = updatedComments
			onCommentsChange(updatedComments)
			content = ''
			anchorTimestamp = false

			await tick()
			list?.highlightComment(json.id)
		} catch {
			formError = 'Erreur réseau.'
		} finally {
			submitting = false
		}
	}

	$effect(() => {
		if (playerReady && !isPlaying && currentTime > 0) {
			anchorTimestamp = true
		} else if (isPlaying) {
			anchorTimestamp = false
		}
	})

	$effect(() => {
		if (!highlightRequest) return
		if (highlightRequest.token === lastHighlightToken) return

		lastHighlightToken = highlightRequest.token
		list?.highlightComment(highlightRequest.id)
	})
</script>

<section class="comments-section">
	<h2>Commentaires ({displayComments.length})</h2>

	{#if displayComments.length === 0}
		<p class="empty">Pas encore de commentaire.</p>
	{:else}
		<div class="list-wrapper">
			<CommentList bind:this={list} comments={displayComments} {onSeek} />
		</div>
	{/if}

	<form class="form-section comment-form" onsubmit={submitComment}>
		<h3>Ajouter un commentaire</h3>

		{#if formError}
			<p class="message-error">{formError}</p>
		{/if}

		<label class="form-label">
			Commentaire
			<textarea class="form-input" rows="3" bind:value={content} required disabled={submitting}></textarea>
		</label>

		<label class="checkbox-label">
			<input type="checkbox" bind:checked={anchorTimestamp} disabled={submitting} />
			Ancrer au timestamp {anchorTimestamp && currentTime > 0 ? `(${formatTime(currentTime)})` : ''}
		</label>

		<button type="submit" class="btn btn-primary" disabled={submitting}>
			{submitting ? 'Envoi…' : 'Envoyer'}
		</button>
	</form>
</section>

<style>
	h2 {
		font-size: var(--text-lg);
		margin: 0 0 1rem;
	}

	.list-wrapper { margin-bottom: 1.5rem; }

	.comment-form { margin-top: 0; }

	h3 { font-size: 0.95rem; margin: 0; }

	.checkbox-label {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 0.5rem;
		font-size: var(--text-sm);
		font-weight: 500;
	}

	.btn { align-self: flex-start; }
</style>
