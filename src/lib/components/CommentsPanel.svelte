<script lang="ts">
	import { tick } from 'svelte'

	type Comment = {
		id: number
		recording_id: number
		author: string
		content: string
		timestamp_s: number | null
		created_at: string
	}

	type HighlightRequest = {
		id: number
		token: number
	}

	let {
		recordingId,
		comments,
		defaultAuthor = '',
		currentTime = 0,
		playerReady = false,
		isPlaying = false,
		highlightRequest = null,
		onSeek = () => {},
		onCommentsChange = () => {}
	}: {
		recordingId: number
		comments: Comment[]
		defaultAuthor?: string
		currentTime?: number
		playerReady?: boolean
		isPlaying?: boolean
		highlightRequest?: HighlightRequest | null
		onSeek?: (seconds: number) => void
		onCommentsChange?: (comments: Comment[]) => void
	} = $props()

	let displayComments = $state(comments)
	let author = $state(defaultAuthor)
	let content = $state('')
	let anchorTimestamp = $state(false)
	let submitting = $state(false)
	let formError = $state<string | null>(null)
	let commentEls = $state<Record<number, HTMLElement>>({})
	let lastHighlightToken = $state<number | null>(null)

	function formatTime(s: number) {
		if (!isFinite(s)) return '0:00'
		const m = Math.floor(s / 60)
		const sec = Math.floor(s % 60)
		return `${m}:${String(sec).padStart(2, '0')}`
	}

	function highlightComment(commentId: number) {
		const el = commentEls[commentId]
		if (!el) return

		el.scrollIntoView({ behavior: 'smooth', block: 'center' })
		el.classList.add('highlight')
		setTimeout(() => el.classList.remove('highlight'), 1500)
	}

	async function submitComment(event: SubmitEvent) {
		event.preventDefault()
		formError = null

		if (!author.trim()) {
			formError = 'Saisis ton prénom.'
			return
		}
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
					author: author.trim(),
					content: content.trim(),
					timestamp_s: ts
				})
			})
			const json = await res.json()
			if (!res.ok) {
				formError = json.error ?? 'Erreur.'
				return
			}

			const updatedComments = [...displayComments, json as Comment]
			displayComments = updatedComments
			onCommentsChange(updatedComments)
			content = ''
			anchorTimestamp = false

			await tick()
			highlightComment(json.id)
		} catch {
			formError = 'Erreur réseau.'
		} finally {
			submitting = false
		}
	}

	$effect(() => {
		displayComments = comments
	})

	$effect(() => {
		if (!author && defaultAuthor) {
			author = defaultAuthor
		}
	})

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
		highlightComment(highlightRequest.id)
	})
</script>

<section class="comments-section">
	<h2>Commentaires ({displayComments.length})</h2>

	{#if displayComments.length === 0}
		<p class="empty">Pas encore de commentaire.</p>
	{:else}
		<ul class="comment-list">
			{#each displayComments as comment (comment.id)}
				<li class="comment" bind:this={commentEls[comment.id]}>
					<div class="comment-header">
						<strong>{comment.author}</strong>
						{#if comment.timestamp_s !== null && comment.timestamp_s !== undefined}
							<button class="timestamp-link" onclick={() => onSeek(comment.timestamp_s!)}>
								⏱ {formatTime(comment.timestamp_s)}
							</button>
						{:else}
							<span class="global-badge">global</span>
						{/if}
						<span class="comment-date">
							{new Date(comment.created_at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
						</span>
					</div>
					<p class="comment-content">{comment.content}</p>
				</li>
			{/each}
		</ul>
	{/if}

	<form class="comment-form" onsubmit={submitComment}>
		<h3>Ajouter un commentaire</h3>

		{#if formError}
			<p class="error">{formError}</p>
		{/if}

		<label>
			Prénom
			<input type="text" bind:value={author} required disabled={submitting} />
		</label>

		<label>
			Commentaire
			<textarea rows="3" bind:value={content} required disabled={submitting}></textarea>
		</label>

		<label class="checkbox-label">
			<input type="checkbox" bind:checked={anchorTimestamp} disabled={submitting} />
			Ancrer au timestamp {anchorTimestamp && currentTime > 0 ? `(${formatTime(currentTime)})` : ''}
		</label>

		<button type="submit" class="btn-primary" disabled={submitting}>
			{submitting ? 'Envoi…' : 'Envoyer'}
		</button>
	</form>
</section>

<style>
	:global(.comment.highlight) {
		background: #fffbe6 !important;
		transition: background 0s;
	}

	h2 {
		font-size: 1.1rem;
		margin: 0 0 1rem;
	}

	.comment-list {
		list-style: none;
		padding: 0;
		margin: 0 0 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.comment {
		border: 1px solid #f0f0f0;
		border-radius: 6px;
		padding: 0.75rem 1rem;
		transition: background 0.6s;
	}

	.comment-header {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin-bottom: 0.35rem;
		font-size: 0.85rem;
	}

	.timestamp-link {
		background: #fff7ed;
		border: 1px solid #fed7aa;
		color: #c2410c;
		border-radius: 4px;
		padding: 0.1rem 0.4rem;
		font-size: 0.78rem;
		cursor: pointer;
		font-weight: 600;
	}

	.timestamp-link:hover {
		background: #ffedd5;
	}

	.global-badge {
		font-size: 0.72rem;
		color: #aaa;
		border: 1px solid #e5e5e5;
		border-radius: 3px;
		padding: 0.1rem 0.35rem;
	}

	.comment-date {
		color: #bbb;
		font-size: 0.78rem;
		margin-left: auto;
	}

	.comment-content {
		font-size: 0.9rem;
		margin: 0;
		white-space: pre-wrap;
		color: #333;
	}

	.comment-form {
		background: #f8f8f8;
		border: 1px solid #e8e8e8;
		border-radius: 8px;
		padding: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	h3 {
		font-size: 0.95rem;
		margin: 0;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.82rem;
		font-weight: 600;
	}

	input[type='text'],
	textarea {
		padding: 0.45rem 0.6rem;
		border: 1px solid #ddd;
		border-radius: 4px;
		font-size: 0.9rem;
		font-family: inherit;
		background: white;
	}

	textarea {
		resize: vertical;
	}

	.checkbox-label {
		flex-direction: row;
		align-items: center;
		gap: 0.5rem;
		font-weight: 500;
	}

	.btn-primary {
		align-self: flex-start;
		padding: 0.5rem 1rem;
		background: #1a1a1a;
		color: white;
		border: none;
		border-radius: 4px;
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
	}

	.btn-primary:hover:not(:disabled) {
		background: #333;
	}

	.btn-primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.error {
		font-size: 0.82rem;
		color: #c0392b;
		margin: 0;
	}

	.empty {
		color: #999;
		font-style: italic;
		margin: 0 0 1.5rem;
	}
</style>
