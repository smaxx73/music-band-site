<script lang="ts">
	import { page } from '$app/state'
	import { formatTimecode } from '$lib/youtube'
	import { canEditComment } from '$lib/types'
	import { MENTION_PATTERN } from '$lib/mentions'
	import type { CommentWithReactions, ReactionValue } from '$lib/types'

	type ReactionState = {
		up_count: number
		down_count: number
		up_reactors: string[]
		down_reactors: string[]
		my_reaction: ReactionValue | null
	}

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
	let visibleReactors = $state<{ commentId: number; value: ReactionValue } | null>(null)

	function reactionState(comment: CommentWithReactions): ReactionState {
		return (
			overrides[comment.id] ?? {
				up_count: comment.up_count ?? 0,
				down_count: comment.down_count ?? 0,
				up_reactors: comment.up_reactors ?? [],
				down_reactors: comment.down_reactors ?? [],
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

	/** Les mentions sont du texte ordinaire : on les met en évidence sans interpréter de HTML. */
	function contentParts(content: string): { text: string; mention: boolean }[] {
		const parts: { text: string; mention: boolean }[] = []
		let position = 0

		for (const match of content.matchAll(MENTION_PATTERN)) {
			const prefix = match[1]
			const mentionStart = (match.index ?? 0) + prefix.length
			if (mentionStart > position) parts.push({ text: content.slice(position, mentionStart), mention: false })
			parts.push({ text: match[2], mention: true })
			position = mentionStart + match[2].length
		}

		if (position < content.length) parts.push({ text: content.slice(position), mention: false })
		return parts.length ? parts : [{ text: content, mention: false }]
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
					up_reactors: json.up_reactors ?? [],
					down_reactors: json.down_reactors ?? [],
					my_reaction: json.my_reaction ?? null
				}
			}
			if (visibleReactors?.commentId === comment.id) {
				const names = visibleReactors.value === 1 ? json.up_reactors : json.down_reactors
				if (!names?.length) visibleReactors = null
			}
		} catch {
			reactionError = { ...reactionError, [comment.id]: 'Erreur réseau.' }
		} finally {
			pending = { ...pending, [comment.id]: false }
		}
	}

	function toggleReactors(commentId: number, value: ReactionValue) {
		visibleReactors =
			visibleReactors?.commentId === commentId && visibleReactors.value === value
				? null
				: { commentId, value }
	}

	function namesFor(reactions: ReactionState, value: ReactionValue) {
		return value === 1 ? reactions.up_reactors : reactions.down_reactors
	}
</script>

<ul class="comment-list" class:compact>
	{#each comments as comment (comment.id)}
		{@const reactions = reactionState(comment)}
		{@const upReactors = namesFor(reactions, 1)}
		{@const downReactors = namesFor(reactions, -1)}
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
				<p class="comment-content">{#each contentParts(comment.content) as part}{#if part.mention}<span class="mention">{part.text}</span>{:else}{part.text}{/if}{/each}</p>
			{/if}

			<div class="reactions">
				<div class="reaction-control">
					<button
						class="reaction"
						class:active={reactions.my_reaction === 1}
						disabled={pending[comment.id]}
						title={reactions.my_reaction === 1 ? 'Retirer mon pouce' : "J'aime"}
						onclick={() => react(comment, 1)}
					>
						👍
					</button>
					{#if upReactors.length > 0}
						<button
							class="reaction-count"
							class:open={visibleReactors?.commentId === comment.id && visibleReactors.value === 1}
							aria-describedby="reactors-{comment.id}-up"
							aria-expanded={visibleReactors?.commentId === comment.id && visibleReactors.value === 1}
							aria-label="Afficher les personnes ayant mis un pouce vers le haut"
							onclick={() => toggleReactors(comment.id, 1)}
						>
							{upReactors.length}
						</button>
						<span class="reactor-tooltip" id="reactors-{comment.id}-up" role="tooltip">
							👍 {upReactors.join(', ')}
						</span>
					{/if}
				</div>
				<div class="reaction-control">
					<button
						class="reaction"
						class:active={reactions.my_reaction === -1}
						disabled={pending[comment.id]}
						title={reactions.my_reaction === -1 ? 'Retirer mon pouce' : "Je n'aime pas"}
						onclick={() => react(comment, -1)}
					>
						👎
					</button>
					{#if downReactors.length > 0}
						<button
							class="reaction-count"
							class:open={visibleReactors?.commentId === comment.id && visibleReactors.value === -1}
							aria-describedby="reactors-{comment.id}-down"
							aria-expanded={visibleReactors?.commentId === comment.id && visibleReactors.value === -1}
							aria-label="Afficher les personnes ayant mis un pouce vers le bas"
							onclick={() => toggleReactors(comment.id, -1)}
						>
							{downReactors.length}
						</button>
						<span class="reactor-tooltip" id="reactors-{comment.id}-down" role="tooltip">
							👎 {downReactors.join(', ')}
						</span>
					{/if}
				</div>
				{#if reactionError[comment.id]}
					<span class="reaction-error">{reactionError[comment.id]}</span>
				{/if}
				{#if editingId !== comment.id && canEditComment(page.data.user, comment.author_user_id)}
					<button class="edit-link" onclick={() => startEdit(comment)}>Modifier</button>
				{/if}
			</div>
			{#if visibleReactors?.commentId === comment.id}
				{@const visibleNames = namesFor(reactions, visibleReactors.value)}
				<div class="reaction-members-panel">
					{visibleReactors.value === 1 ? '👍' : '👎'} {visibleNames.join(', ')}
				</div>
			{/if}
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

	.mention { color: var(--color-accent); font-weight: 700; }

	.reactions {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		margin-top: 0.45rem;
	}

	.reaction-control {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 0.1rem;
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
		min-width: 2rem;
		min-height: 2rem;
		padding: 0.2rem 0.35rem;
		background: transparent;
		border: none;
		border-radius: var(--radius-md);
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-text-secondary);
		cursor: pointer;
	}

	.reaction-count:hover,
	.reaction-count:focus-visible,
	.reaction-count.open { background: var(--color-bg-muted); color: var(--color-accent); }

	.reactor-tooltip {
		display: none;
		position: absolute;
		z-index: 2;
		bottom: calc(100% + 0.35rem);
		left: 0;
		width: max-content;
		max-width: min(18rem, calc(100vw - 2rem));
		box-sizing: border-box;
		padding: 0.4rem 0.55rem;
		border-radius: var(--radius-md);
		background: var(--color-text);
		color: var(--color-bg);
		font-size: var(--text-xs);
		line-height: 1.35;
		white-space: normal;
		box-shadow: 0 2px 8px rgb(0 0 0 / 18%);
	}

	@media (hover: hover) {
		.reaction-control:hover .reactor-tooltip,
		.reaction-control:focus-within .reactor-tooltip,
		.reaction-count:focus-visible + .reactor-tooltip { display: block; }
	}

	.reaction-members-panel {
		margin-top: 0.35rem;
		padding: 0.35rem 0.5rem;
		width: fit-content;
		border-radius: var(--radius-md);
		background: var(--color-bg-muted);
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
	}

	@media (hover: hover) and (pointer: fine) {
		.reaction-members-panel { display: none; }
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
