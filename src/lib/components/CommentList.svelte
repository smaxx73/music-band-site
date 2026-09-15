<script lang="ts">
	import { page } from '$app/state'
	import { formatTimecode } from '$lib/youtube'
	import { canEditComment } from '$lib/types'
	import type { CommentWithReactions, ReactionValue } from '$lib/types'

	type ReactionState = { up_count: number; down_count: number; my_reaction: ReactionValue | null }

	let {
		comments,
		onSeek = null,
		compact = false,
		onCommentsChange = () => {}
	}: {
		comments: CommentWithReactions[]
		/** Fourni uniquement quand un lecteur est monté : rend les timestamps cliquables. */
		onSeek?: ((seconds: number) => void) | null
		compact?: boolean
		/** Remonte une modification afin que toutes les vues du parent restent synchronisées. */
		onCommentsChange?: (comments: CommentWithReactions[]) => void
	} = $props()

	// Les réactions modifiées localement priment sur la valeur reçue du serveur,
	// pour éviter de recharger toute la page à chaque pouce.
	let overrides = $state<Record<number, ReactionState>>({})
	let pending = $state<Record<number, boolean>>({})
	let reactionError = $state<Record<number, string>>({})

	function reactionState(comment: CommentWithReactions): ReactionState {
		return (
			overrides[comment.id] ?? {
				up_count: comment.up_count ?? 0,
				down_count: comment.down_count ?? 0,
				my_reaction: comment.my_reaction ?? null
			}
		)
	}

	let editingId = $state<number | null>(null)
	let draft = $state('')
	let saving = $state(false)
	let editError = $state<string | null>(null)

	function startEdit(comment: CommentWithReactions) {
		editingId = comment.id
		draft = comment.content
		editError = null
	}

	function cancelEdit() {
		editingId = null
		editError = null
	}

	async function saveEdit(comment: CommentWithReactions) {
		if (saving) return
		if (!draft.trim()) { editError = 'Le commentaire est vide.'; return }

		saving = true
		editError = null
		try {
			const res = await fetch(`/api/comments/${comment.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ content: draft.trim() })
			})
			const json = await res.json().catch(() => ({}))
			if (!res.ok) { editError = json.error ?? 'Erreur.'; return }
			onCommentsChange(
				comments.map((current) =>
					current.id === comment.id
						? { ...current, ...json, author: current.author }
						: current
				)
			)
			editingId = null
		} catch {
			editError = 'Erreur réseau.'
		} finally {
			saving = false
		}
	}

	function onEditKeydown(e: KeyboardEvent, comment: CommentWithReactions) {
		if (e.key === 'Escape') cancelEdit()
		else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveEdit(comment)
	}

	// Gère les heures : une vidéo YouTube peut dépasser 60 minutes.
	const formatTime = formatTimecode

	function formatDate(d: string | Date) {
		return new Date(d).toLocaleString('fr-FR', {
			day: 'numeric',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit'
		})
	}

	let commentEls = $state<Record<number, HTMLElement>>({})

	/** Appelée par le parent (bind:this) pour cibler un commentaire depuis la waveform. */
	export function highlightComment(commentId: number) {
		const el = commentEls[commentId]
		if (!el) return

		el.scrollIntoView({ behavior: 'smooth', block: 'center' })
		el.classList.add('highlight')
		setTimeout(() => el.classList.remove('highlight'), 1500)
	}

	async function react(comment: CommentWithReactions, value: ReactionValue) {
		if (pending[comment.id]) return

		// Re-cliquer le pouce déjà posé retire la réaction.
		const remove = reactionState(comment).my_reaction === value

		pending = { ...pending, [comment.id]: true }
		delete reactionError[comment.id]
		reactionError = { ...reactionError }

		try {
			const res = await fetch(`/api/comments/${comment.id}/reactions`, {
				method: remove ? 'DELETE' : 'POST',
				headers: remove ? {} : { 'Content-Type': 'application/json' },
				body: remove ? undefined : JSON.stringify({ value })
			})
			const json = await res.json()
			if (!res.ok) {
				reactionError = { ...reactionError, [comment.id]: json.error ?? 'Erreur.' }
				return
			}
			overrides = {
				...overrides,
				[comment.id]: {
					up_count: json.up_count,
					down_count: json.down_count,
					my_reaction: json.my_reaction ?? null
				}
			}
		} catch {
			reactionError = { ...reactionError, [comment.id]: 'Erreur réseau.' }
		} finally {
			pending = { ...pending, [comment.id]: false }
		}
	}
</script>

<ul class="comment-list" class:compact>
	{#each comments as comment (comment.id)}
		{@const reactions = reactionState(comment)}
		<li class="comment" bind:this={commentEls[comment.id]}>
			<div class="comment-header">
				<strong>{comment.author}</strong>
				{#if comment.timestamp_s !== null && comment.timestamp_s !== undefined}
					{#if onSeek}
						<button class="timestamp-link" onclick={() => onSeek?.(comment.timestamp_s as number)}>
							⏱ {formatTime(comment.timestamp_s)}
						</button>
					{:else}
						<span class="timestamp-badge">⏱ {formatTime(comment.timestamp_s)}</span>
					{/if}
				{/if}
				<span class="comment-date">
					{formatDate(comment.created_at)}
					{#if comment.edited_at}
						<span class="edited" title="Modifié le {formatDate(comment.edited_at)}">(modifié)</span>
					{/if}
				</span>
			</div>

			{#if editingId === comment.id}
				<div class="edit-form">
					<!-- svelte-ignore a11y_autofocus -->
					<textarea
						bind:value={draft}
						rows="3"
						autofocus
						disabled={saving}
						onkeydown={(e) => onEditKeydown(e, comment)}
					></textarea>
					<div class="edit-actions">
						<button class="btn btn-primary btn-sm" disabled={saving} onclick={() => saveEdit(comment)}>
							{saving ? 'Enregistrement…' : 'Enregistrer'}
						</button>
						<button class="btn btn-ghost btn-sm" disabled={saving} onclick={cancelEdit}>Annuler</button>
						{#if editError}<span class="reaction-error">{editError}</span>{/if}
					</div>
				</div>
			{:else}
				<p class="comment-content">{comment.content}</p>
			{/if}

			<div class="reactions">
				<button
					class="reaction"
					class:active={reactions.my_reaction === 1}
					disabled={pending[comment.id]}
					title={reactions.my_reaction === 1 ? 'Retirer mon pouce' : "J'aime"}
					onclick={() => react(comment, 1)}
				>
					👍{#if reactions.up_count > 0}<span class="reaction-count">{reactions.up_count}</span>{/if}
				</button>
				<button
					class="reaction"
					class:active={reactions.my_reaction === -1}
					disabled={pending[comment.id]}
					title={reactions.my_reaction === -1 ? 'Retirer mon pouce' : "Je n'aime pas"}
					onclick={() => react(comment, -1)}
				>
					👎{#if reactions.down_count > 0}<span class="reaction-count">{reactions.down_count}</span>{/if}
				</button>
				{#if reactionError[comment.id]}
					<span class="reaction-error">{reactionError[comment.id]}</span>
				{/if}
				{#if editingId !== comment.id && canEditComment(page.data.user, comment.author_user_id)}
					<button class="edit-link" onclick={() => startEdit(comment)}>Modifier</button>
				{/if}
			</div>
		</li>
	{/each}
</ul>

<style>
	:global(.comment.highlight) {
		background: #fffbe6 !important;
		transition: background 0s;
	}

	.comment-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.comment {
		border: 1px solid var(--color-border-light);
		border-radius: var(--radius-lg);
		padding: 0.75rem 1rem;
		transition: background 0.6s;
	}

	.compact .comment {
		padding: 0.5rem 0.7rem;
	}

	.comment-header {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin-bottom: 0.35rem;
		font-size: 0.85rem;
	}

	.timestamp-link,
	.timestamp-badge {
		background: #fff7ed;
		border: 1px solid #fed7aa;
		color: #c2410c;
		border-radius: var(--radius-md);
		padding: 0.1rem 0.4rem;
		font-size: 0.78rem;
		font-weight: 600;
	}

	.timestamp-link { cursor: pointer; }
	.timestamp-link:hover { background: #ffedd5; }

	.comment-date {
		color: var(--color-text-muted);
		font-size: 0.78rem;
		margin-left: auto;
	}

	.comment-content {
		font-size: 0.9rem;
		margin: 0;
		white-space: pre-wrap;
		color: var(--color-text);
	}

	.reactions {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		margin-top: 0.45rem;
	}

	.reaction {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		background: transparent;
		border: 1px solid var(--color-border-light);
		border-radius: 20px;
		padding: 0.05rem 0.45rem;
		font-size: 0.8rem;
		line-height: 1.5;
		cursor: pointer;
	}

	.reaction:hover:not(:disabled) { background: var(--color-bg-muted); }
	.reaction:disabled { opacity: 0.5; cursor: default; }

	.reaction.active {
		border-color: var(--color-accent);
		background: var(--color-accent-light);
	}

	.reaction-count {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-text-secondary);
	}

	.edited {
		font-style: italic;
		margin-left: 0.2rem;
	}

	.edit-link {
		margin-left: auto;
		background: none;
		border: none;
		padding: 0;
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		cursor: pointer;
	}

	.edit-link:hover { color: var(--color-text); text-decoration: underline; }

	.edit-form textarea {
		width: 100%;
		box-sizing: border-box;
		font: inherit;
		font-size: 0.9rem;
		resize: vertical;
	}

	.edit-actions {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-top: 0.35rem;
	}

	.reaction-error {
		font-size: var(--text-xs);
		color: var(--color-error);
	}
</style>
