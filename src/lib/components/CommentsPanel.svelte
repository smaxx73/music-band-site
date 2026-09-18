<script lang="ts">
	import { onMount, tick } from 'svelte'
	import CommentList from '$lib/components/CommentList.svelte'
	import MentionTextarea, { type MentionMember } from '$lib/components/MentionTextarea.svelte'
	import type { CommentWithReactions } from '$lib/types'

	type HighlightRequest = {
		id: number
		token: number
	}

	let {
		recordingId,
		comments,
		members,
		currentTime = 0,
		playerReady = false,
		isPlaying = false,
		highlightRequest = null,
		onSeek = () => {},
		onCommentsChange = () => {}
	}: {
		recordingId: number
		comments: CommentWithReactions[]
		members: MentionMember[]
		currentTime?: number
		playerReady?: boolean
		isPlaying?: boolean
		highlightRequest?: HighlightRequest | null
		onSeek?: (seconds: number) => void
		onCommentsChange?: (comments: CommentWithReactions[]) => void
	} = $props()

	// $derived inscriptible : ajout optimiste local, resynchronisé dès que le parent change
	let displayComments = $derived(comments)

	/** Au-delà, les plus anciens se replient : la fin de la discussion reste à l'écran. */
	const FOLD_THRESHOLD = 20

	// L'ordre d'écriture raconte la discussion ; l'ordre du morceau raconte la prise.
	// Sur une prise longuement commentée, c'est le second qu'on suit en réécoutant.
	let sort = $state<'chrono' | 'position'>('chrono')
	let followPlayback = $state(false)

	function anchor(comment: CommentWithReactions): number | null {
		return comment.timestamp_s ?? null
	}

	const anchoredComments = $derived(displayComments.filter((c) => anchor(c) !== null))
	const globalComments = $derived(displayComments.filter((c) => anchor(c) === null))

	const orderedComments = $derived(
		sort === 'chrono'
			? displayComments
			: [
					...[...anchoredComments].sort((a, b) => (anchor(a) as number) - (anchor(b) as number)),
					...globalComments
				]
	)

	// Les commentaires sans ancrage ne se rangent nulle part dans le morceau : ils se
	// regroupent en fin de liste, sous leur propre libellé.
	const separatorBeforeId = $derived(
		sort === 'position' && anchoredComments.length > 0 && globalComments.length > 0
			? globalComments[0].id
			: null
	)

	// Replier n'a de sens que sur une liste chronologique : ailleurs, « les plus
	// anciens » ne sont pas ceux du haut.
	const maxVisible = $derived(sort === 'chrono' ? FOLD_THRESHOLD : null)

	let content = $state('')
	let anchorTimestamp = $state(false)
	let submitting = $state(false)
	let formError = $state<string | null>(null)
	let lastHighlightToken = $state<number | null>(null)
	let list = $state<ReturnType<typeof CommentList> | null>(null)
	let form = $state<HTMLFormElement | null>(null)
	let input = $state<ReturnType<typeof MentionTextarea> | null>(null)

	// Les vues session et morceau renvoient ici via `#commenter` : on arrive pour écrire,
	// le curseur doit déjà être dans la zone de texte.
	onMount(() => {
		if (location.hash !== '#commenter') return
		form?.scrollIntoView({ block: 'center' })
		input?.focus()
	})

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

	// Sans position de lecture, il n'y a rien à ancrer : la pastille ne s'affiche pas.
	const canAnchor = $derived(playerReady && isFinite(currentTime) && currentTime > 0)

	// L'ancrage suit ce que la pastille peut faire : elle disparaît, il retombe.
	$effect(() => {
		if (!canAnchor && anchorTimestamp) anchorTimestamp = false
	})

	/** Ctrl/⌘+Entrée : le bouton est désactivé à vide, le raccourci l'est aussi. */
	function send() {
		if (submitting || !content.trim()) return
		form?.requestSubmit()
	}

	function handleCommentsChange(updatedComments: CommentWithReactions[]) {
		displayComments = updatedComments
		onCommentsChange(updatedComments)
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
	<div class="panel-head">
		<h2>Commentaires ({displayComments.length})</h2>

		{#if anchoredComments.length > 1}
			<div class="list-tools">
				<div class="sort-toggle" role="group" aria-label="Ordre des commentaires">
					<button
						type="button"
						class:active={sort === 'chrono'}
						onclick={() => (sort = 'chrono')}
					>Chronologique</button>
					<button
						type="button"
						class:active={sort === 'position'}
						onclick={() => (sort = 'position')}
					>Dans le morceau</button>
				</div>
				{#if playerReady}
					<label class="follow-toggle">
						<input type="checkbox" bind:checked={followPlayback} />
						Suivre la lecture
					</label>
				{/if}
			</div>
		{/if}
	</div>

	{#if displayComments.length === 0}
		<p class="empty">Pas encore de commentaire.</p>
	{:else}
		<div class="list-wrapper">
			<CommentList
				bind:this={list}
				comments={orderedComments}
				{recordingId}
				{onSeek}
				{maxVisible}
				{separatorBeforeId}
				separatorLabel="Commentaires généraux"
				currentTime={playerReady ? currentTime : null}
				follow={followPlayback}
				onCommentsChange={handleCommentsChange}
			/>
		</div>
	{/if}

	<!-- Une zone de saisie de discussion, pas un panneau de formulaire : le cadre EST le
	     champ, et les actions tiennent sur sa droite. Le titre « Commentaires (n) » annonce
	     déjà la section, le placeholder porte l'intitulé comme la règle du @. -->
	<form id="commenter" class="comment-form" onsubmit={submitComment} bind:this={form}>
		{#if formError}
			<p class="message-error">{formError}</p>
		{/if}

		<div class="composer">
			<MentionTextarea
				bind:this={input}
				members={members}
				bind:value={content}
				label="Ajouter un commentaire"
				placeholder="Écrire un commentaire… (@ pour mentionner)"
				hideLabel
				autogrow
				bare
				rows={2}
				onSubmitShortcut={send}
				disabled={submitting}
			/>

			<!-- Voisines de la saisie, jamais posées par-dessus : le texte ne passe pas
			     dessous, et les boutons restent en bas quand la zone grandit. -->
			<div class="composer-actions">
				{#if canAnchor}
					<!-- Le repère est lisible avant d'ancrer : on voit où le commentaire se posera. -->
					<button
						type="button"
						class="anchor-pill"
						class:on={anchorTimestamp}
						aria-pressed={anchorTimestamp}
						title={anchorTimestamp
							? `Commentaire ancré à ${formatTime(currentTime)} — cliquer pour le détacher`
							: `Ancrer le commentaire à ${formatTime(currentTime)}`}
						disabled={submitting}
						onclick={() => (anchorTimestamp = !anchorTimestamp)}
					>
						⏱ {formatTime(currentTime)}
					</button>
				{/if}

				<button
					type="submit"
					class="send"
					disabled={submitting || !content.trim()}
					aria-label="Envoyer le commentaire"
					title="Envoyer (Ctrl/⌘+Entrée)"
				>
					{submitting ? '…' : '➤'}
				</button>
			</div>
		</div>
	</form>
</section>

<style>
	.panel-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.5rem 1rem;
		margin-bottom: 1rem;
	}

	h2 {
		font-size: var(--text-lg);
		margin: 0;
	}

	.list-tools {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.4rem 0.9rem;
	}

	.sort-toggle {
		display: inline-flex;
		border: 1px solid var(--color-border-light);
		border-radius: 999px;
		overflow: hidden;
	}

	.sort-toggle button {
		background: none;
		border: none;
		padding: 0.2rem 0.7rem;
		font: inherit;
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
		cursor: pointer;
	}

	.sort-toggle button:hover { background: var(--color-bg-muted); }

	.sort-toggle button.active {
		background: var(--color-accent-light);
		color: var(--color-accent);
		font-weight: 600;
	}

	.follow-toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
		cursor: pointer;
	}

	.list-wrapper { margin-bottom: 1.5rem; }

	.comment-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin-top: 0;
		scroll-margin-top: var(--comment-scroll-margin, 1rem);
	}

	/* Le cadre du champ, porté par le conteneur : la saisie et ses actions sont dedans. */
	.composer {
		display: flex;
		align-items: flex-end;
		gap: 0.4rem;
		padding: 0.5rem 0.55rem;
		border: 1px solid var(--color-border-input);
		border-radius: var(--radius-lg);
		background: var(--color-bg);
	}

	.composer:focus-within { border-color: var(--color-accent); }

	/* La saisie prend toute la place restante ; `min-width: 0` l'empêche de pousser
	   les boutons hors du cadre quand une URL sans espace s'y invite. */
	.composer > :global(.mention-input) { flex: 1; min-width: 0; }

	.composer-actions {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		flex-shrink: 0;
	}

	.send {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 34px;
		height: 34px;
		padding: 0;
		border: none;
		border-radius: 50%;
		background: var(--color-primary);
		color: #fff;
		font-size: 0.9rem;
		line-height: 1;
		cursor: pointer;
	}

	.send:hover:not(:disabled) { background: var(--color-primary-hover); }

	/* À vide, il ne promet rien : pas de clic qui déclenche une infobulle du navigateur. */
	.send:disabled {
		background: var(--color-border-light);
		color: var(--color-text-muted);
		cursor: default;
	}

	/* Une propriété du commentaire, pas une case de formulaire : elle se lit d'un coup
	   d'œil et s'active d'un clic, sur la même ligne que l'envoi. */
	.anchor-pill {
		background: none;
		border: 1px solid var(--color-border-light);
		border-radius: 999px;
		padding: 0.2rem 0.6rem;
		font: inherit;
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
		color: var(--color-text-secondary);
		cursor: pointer;
	}

	.anchor-pill:hover:not(:disabled) { background: var(--color-bg-muted); }

	.anchor-pill.on {
		border-color: var(--color-accent);
		background: var(--color-accent-light);
		color: var(--color-accent);
		font-weight: 600;
	}

	/* Au doigt, une cible de 34 px se rate : le bouton d'envoi grandit. */
	@media (max-width: 640px) {
		.send { width: 40px; height: 40px; font-size: 1rem; }
	}
</style>
