<script lang="ts">
	import { tick, untrack } from 'svelte'
	import { page } from '$app/state'
	import { formatTimecode, parseTimecode } from '$lib/youtube'
	import { formatDateTime, formatDateTimeFull } from '$lib/date'
	import { canEditComment } from '$lib/types'
	import { commentParts, commentVideos } from '$lib/comment-content'
	import YouTubeEmbed from '$lib/components/YouTubeEmbed.svelte'
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
		recordingId = null,
		onSeek = null,
		compact = false,
		currentTime = null,
		follow = false,
		maxVisible = null,
		moreHref = null,
		separatorBeforeId = null,
		separatorLabel = '',
		onCommentsChange = () => {}
	}: {
		comments: CommentWithReactions[]
		/** Prise à laquelle ces commentaires appartiennent : donne son lien à chacun. */
		recordingId?: number | null
		/** Fourni uniquement quand un lecteur est monté : rend les timestamps cliquables. */
		onSeek?: ((seconds: number) => void) | null
		compact?: boolean
		/** Position du lecteur, quand il y en a un : marque le commentaire en cours. */
		currentTime?: number | null
		/** Fait suivre la liste à la lecture, commentaire ancré après commentaire ancré. */
		follow?: boolean
		/** Au-delà, seuls les derniers sont montés : une discussion se lit par la fin. */
		maxVisible?: number | null
		/** Fourni quand les plus anciens se lisent ailleurs (lien) plutôt qu'ici (bouton). */
		moreHref?: string | null
		/** Sépare deux blocs dans une liste triée autrement que par date. */
		separatorBeforeId?: number | null
		separatorLabel?: string
		/** Remonte une modification afin que toutes les vues du parent restent synchronisées. */
		onCommentsChange?: (comments: CommentWithReactions[]) => void
	} = $props()

	// Les plus anciens sont repliés tant qu'on ne les demande pas : au-delà d'une
	// vingtaine, la fin de la discussion et le formulaire seraient hors de l'écran.
	let expanded = $state(false)

	const hiddenCount = $derived(
		maxVisible !== null && !expanded && comments.length > maxVisible
			? comments.length - maxVisible
			: 0
	)
	const visibleComments = $derived(hiddenCount > 0 ? comments.slice(hiddenCount) : comments)

	/**
	 * Dernier commentaire ancré que la lecture a dépassé : c'est celui dont on parle
	 * à cet instant du morceau. Aucun tant que la lecture n'a atteint le premier.
	 */
	const activeId = $derived.by(() => {
		if (currentTime === null || !isFinite(currentTime)) return null
		let bestId: number | null = null
		let bestTime = -1
		for (const comment of comments) {
			const t = comment.timestamp_s
			if (t === null || t === undefined) continue
			if (t <= currentTime && t >= bestTime) {
				bestTime = t
				bestId = comment.id
			}
		}
		return bestId
	})

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
	let timestampDraft = $state('')
	let saving = $state(false)
	let editError = $state<string | null>(null)

	function startEdit(comment: CommentWithReactions) {
		editingId = comment.id
		draft = comment.content
		timestampDraft = comment.timestamp_s === null || comment.timestamp_s === undefined
			? ''
			: formatTimecode(comment.timestamp_s)
		editError = null
	}

	function cancelEdit() {
		editingId = null
		editError = null
	}

	async function saveEdit(comment: CommentWithReactions) {
		if (saving) return
		if (!draft.trim()) { editError = 'Le commentaire est vide.'; return }
		const timestamp = parseTimecode(timestampDraft)
		if (timestampDraft.trim() && (timestamp === null || !Number.isFinite(timestamp))) {
			editError = 'Utilisez un repère en secondes, mm:ss ou h:mm:ss.'
			return
		}

		saving = true
		editError = null
		try {
			const res = await fetch(`/api/comments/${comment.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ content: draft.trim(), timestamp_s: timestamp })
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

	// Un commentaire est ce qu'on partage le plus volontiers d'une prise (« regarde ce
	// qu'a écrit Marc ») : il lui faut son propre lien. Le repère l'accompagne, pour que
	// le destinataire arrive au bon endroit du morceau et pas seulement sur la page.
	let copiedCommentId = $state<number | null>(null)

	async function copyCommentLink(comment: CommentWithReactions) {
		if (recordingId === null) return
		const target = new URL(`/recording/${recordingId}`, location.origin)
		if (comment.timestamp_s !== null && comment.timestamp_s !== undefined) {
			target.searchParams.set('t', String(Math.floor(comment.timestamp_s)))
		}
		target.hash = `comment-${comment.id}`
		try {
			await navigator.clipboard.writeText(target.toString())
			copiedCommentId = comment.id
			setTimeout(() => {
				if (copiedCommentId === comment.id) copiedCommentId = null
			}, 2000)
		} catch {
			// Presse-papiers refusé : rien à rattraper ici, le lien reste atteignable
			// depuis la page elle-même.
		}
	}

	let commentEls = $state<Record<number, HTMLElement>>({})

	/**
	 * Amène un commentaire à l'écran, en dépliant d'abord les anciens s'il en fait partie :
	 * un marqueur de la waveform peut viser un commentaire encore replié.
	 */
	async function revealComment(commentId: number, flash: boolean) {
		if (!commentEls[commentId]) {
			expanded = true
			await tick()
		}
		const el = commentEls[commentId]
		if (!el) return

		el.scrollIntoView({ behavior: 'smooth', block: 'center' })
		if (!flash) return
		el.classList.add('highlight')
		setTimeout(() => el.classList.remove('highlight'), 1500)
	}

	/** Appelée par le parent (bind:this) pour cibler un commentaire depuis la waveform. */
	export function highlightComment(commentId: number) {
		revealComment(commentId, true)
	}

	// Suivi de lecture : on ne déplace la page qu'au changement de commentaire courant,
	// jamais à chaque quart de seconde de lecture.
	let followedId: number | null = null
	$effect(() => {
		if (!follow) {
			followedId = null
			return
		}
		const id = activeId
		if (id === null || id === followedId) return
		followedId = id
		untrack(() => revealComment(id, false))
	})

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

{#if hiddenCount > 0}
	<div class="older">
		{#if moreHref}
			<a href={moreHref} class="older-link">
				Voir les {hiddenCount} commentaire{hiddenCount > 1 ? 's' : ''} précédent{hiddenCount > 1 ? 's' : ''} dans le lecteur →
			</a>
		{:else}
			<button type="button" class="older-link" onclick={() => (expanded = true)}>
				↑ Afficher les {hiddenCount} commentaire{hiddenCount > 1 ? 's' : ''} précédent{hiddenCount > 1 ? 's' : ''}
			</button>
		{/if}
	</div>
{/if}

<ul class="comment-list" class:compact>
	{#each visibleComments as comment (comment.id)}
		{@const reactions = reactionState(comment)}
		{@const upReactors = namesFor(reactions, 1)}
		{@const downReactors = namesFor(reactions, -1)}
		{#if separatorBeforeId === comment.id}
			<li class="group-separator">{separatorLabel}</li>
		{/if}
		<li
			class="comment"
			id="comment-{comment.id}"
			class:active={activeId === comment.id}
			bind:this={commentEls[comment.id]}
		>
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
					{formatDateTime(comment.created_at)}
					{#if comment.edited_at}
						<span class="edited" title="Modifié le {formatDateTimeFull(comment.edited_at)}">(modifié)</span>
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
					<div class="timestamp-editor">
						<label for="comment-timestamp-{comment.id}">Repère dans la prise</label>
						<input
							id="comment-timestamp-{comment.id}"
							type="text"
							inputmode="decimal"
							placeholder="mm:ss"
							aria-describedby="comment-timestamp-help-{comment.id}"
							bind:value={timestampDraft}
							disabled={saving}
							onkeydown={(e) => onEditKeydown(e, comment)}
						/>
						<span id="comment-timestamp-help-{comment.id}">Secondes, mm:ss ou h:mm:ss</span>
						{#if timestampDraft.trim()}
							<button
								type="button"
								class="remove-timestamp"
								disabled={saving}
								onclick={() => (timestampDraft = '')}
							>Supprimer le timestamp</button>
						{/if}
					</div>
					<div class="edit-actions">
						<button class="btn btn-primary btn-sm" disabled={saving} onclick={() => saveEdit(comment)}>
							{saving ? 'Enregistrement…' : 'Enregistrer'}
						</button>
						<button class="btn btn-ghost btn-sm" disabled={saving} onclick={cancelEdit}>Annuler</button>
						{#if editError}<span class="reaction-error">{editError}</span>{/if}
					</div>
				</div>
			{:else}
				<p class="comment-content">{#each commentParts(comment.content) as part}{#if part.kind === 'mention'}<span class="mention">{part.text}</span>{:else if part.kind === 'link'}<a class="comment-link" href={part.href} target="_blank" rel="noopener noreferrer nofollow">{part.text}</a>{:else}{part.text}{/if}{/each}</p>
				{#each commentVideos(comment.content) as video (video.videoId)}
					<YouTubeEmbed videoId={video.videoId} startSeconds={video.startSeconds} />
				{/each}
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
				{#if recordingId !== null}
					<button
						class="link-copy"
						title="Copier le lien vers ce commentaire"
						aria-label="Copier le lien vers ce commentaire"
						onclick={() => copyCommentLink(comment)}
					>
						{copiedCommentId === comment.id ? '✓ Copié' : '🔗'}
					</button>
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
		background: var(--color-bg);
		border: 1px solid var(--color-border-light);
		border-radius: var(--radius-lg);
		padding: 0.75rem 1rem;
		transition: background 0.6s;
		/* Le lecteur reste collé en haut : un commentaire visé ne doit pas finir dessous. */
		scroll-margin-top: var(--comment-scroll-margin, 1rem);
		scroll-margin-bottom: 1rem;
	}

	/* Commentaire que la lecture vient de dépasser : le repère suit la musique. */
	.comment.active {
		border-color: var(--color-accent);
		box-shadow: inset 3px 0 0 var(--color-accent);
	}

	.group-separator {
		margin: 0.4rem 0 0.1rem;
		font-size: var(--text-xs);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-text-muted);
	}

	.older { margin-bottom: 0.5rem; }

	.older-link {
		display: inline-block;
		background: none;
		border: none;
		padding: 0;
		font: inherit;
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		text-decoration: none;
		cursor: pointer;
	}

	.older-link:hover { color: var(--color-accent); text-decoration: underline; }

	/* `compact` ne change que la densité. Un commentaire se dessine pareil partout :
	   ce qui distingue le tiroir d'une prise, c'est le plateau creusé qui l'accueille
	   (`row-drawer`), pas une seconde façon de dessiner la même carte. */
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

	/* Une URL collée n'a pas d'espace : sans cela elle élargit la carte du commentaire. */
	.comment-link {
		color: var(--color-primary);
		overflow-wrap: anywhere;
	}

	.comment-link:hover { text-decoration: underline; }

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

	.link-copy {
		margin-left: auto;
		background: none;
		border: none;
		padding: 0;
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		cursor: pointer;
	}

	.link-copy:hover { color: var(--color-text); }

	/* Les deux poussent à droite : sans cela, l'espace libre se partagerait entre eux. */
	.link-copy + .edit-link { margin-left: 0.6rem; }

	.edit-form textarea {
		width: 100%;
		box-sizing: border-box;
		font: inherit;
		font-size: 0.9rem;
		resize: vertical;
	}

	.timestamp-editor {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.35rem 0.55rem;
		margin-top: 0.45rem;
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
	}

	.timestamp-editor label { font-weight: 600; }

	.timestamp-editor input {
		width: 6.5rem;
		box-sizing: border-box;
		padding: 0.25rem 0.4rem;
		font: inherit;
		font-variant-numeric: tabular-nums;
	}

	.timestamp-editor span { color: var(--color-text-muted); }

	.remove-timestamp {
		background: none;
		border: none;
		padding: 0;
		font: inherit;
		color: var(--color-text-muted);
		text-decoration: underline;
		cursor: pointer;
	}

	.remove-timestamp:hover:not(:disabled) { color: var(--color-text); }

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
