<script lang="ts">
	import { onMount, tick, untrack } from 'svelte'
	import CommentList from '$lib/components/CommentList.svelte'
	import MentionTextarea, { type MentionMember } from '$lib/components/MentionTextarea.svelte'
	import Icon from '$lib/components/Icon.svelte'
	import { threadParam } from '$lib/types'
	import type { CommentThread, CommentWithReactions } from '$lib/types'

	type HighlightRequest = {
		id: number
		token: number
	}

	let {
		thread,
		comments,
		members,
		currentTime = 0,
		playerReady = false,
		highlightRequest = null,
		onSeek = () => {},
		onCommentsChange = () => {},
		onDraftAnchorChange = () => {},
		inline = false
	}: {
		/** Prise ou setlist : ce dont on discute ici. */
		thread: CommentThread
		comments: CommentWithReactions[]
		members: MentionMember[]
		currentTime?: number
		playerReady?: boolean
		highlightRequest?: HighlightRequest | null
		onSeek?: (seconds: number) => void
		onCommentsChange?: (comments: CommentWithReactions[]) => void
		/**
		 * Repère du commentaire en cours d'écriture, `null` s'il est général ou vide : la
		 * page le montre sur le lecteur, pour qu'on voie où il se posera avant d'envoyer.
		 */
		onDraftAnchorChange?: (seconds: number | null) => void
		/**
		 * Sous une carte du fil : ni titre ni outils de tri, et seuls les derniers
		 * commentaires sont montrés — les précédents se déplient sur place.
		 */
		inline?: boolean
	} = $props()

	// $derived inscriptible : ajout optimiste local, resynchronisé dès que le parent change
	let displayComments = $derived(comments)

	/** Au-delà, les plus anciens se replient : la fin de la discussion reste à l'écran. */
	const FOLD_THRESHOLD = 20
	/** Sous une carte du fil, la fin de la discussion suffit à donner envie de la lire. */
	const INLINE_FOLD_THRESHOLD = 2

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
	const maxVisible = $derived(inline ? INLINE_FOLD_THRESHOLD : sort === 'chrono' ? FOLD_THRESHOLD : null)

	let content = $state('')
	// Général par défaut : ancrer est un choix conscient, jamais une déduction de l'écran.
	let anchorChoice = $state<'anchored' | 'general'>('general')
	// Repère figé à la première frappe : on commente ce qu'on vient d'entendre, pas ce que
	// la lecture, qui continue pendant qu'on écrit, joue au moment d'envoyer.
	let capturedTime = $state<number | null>(null)
	let draftStarted = $state(false)
	let submitting = $state(false)
	let formError = $state<string | null>(null)
	let lastHighlightToken = $state<number | null>(null)
	let list = $state<ReturnType<typeof CommentList> | null>(null)
	let form = $state<HTMLFormElement | null>(null)
	let input = $state<ReturnType<typeof MentionTextarea> | null>(null)

	// Les vues session et morceau renvoient ici via `#commenter` : on arrive pour écrire,
	// le curseur doit déjà être dans la zone de texte.
	onMount(() => {
		if (inline || location.hash !== '#commenter') return
		form?.scrollIntoView({ block: 'center' })
		input?.focus()
	})

	function formatTime(s: number) {
		if (!isFinite(s)) return '0:00'
		const m = Math.floor(s / 60)
		const sec = Math.floor(s % 60)
		return `${m}:${String(sec).padStart(2, '0')}`
	}

	// Sans position de lecture, il n'y a rien à ancrer : le choix ne s'affiche pas.
	const anchorable = $derived(thread.kind !== 'setlist' && (thread.kind !== 'post' || thread.anchorable))
	const canAnchor = $derived(anchorable && playerReady && isFinite(currentTime) && currentTime > 0)

	// Avant la première frappe, le repère suit la lecture ; ensuite il ne bouge plus.
	const anchorTime = $derived(capturedTime ?? currentTime)

	const anchored = $derived(
		anchorChoice === 'anchored' && anchorable && playerReady && anchorTime > 0
	)

	// La lecture a quitté le repère figé : on propose d'y recaler le commentaire ancré.
	const canRetarget = $derived(
		anchored && capturedTime !== null && canAnchor && Math.abs(currentTime - capturedTime) >= 2
	)

	$effect(() => {
		const empty = content === ''
		untrack(() => {
			if (empty) {
				draftStarted = false
				capturedTime = null
				anchorChoice = 'general'
			} else if (!draftStarted) {
				draftStarted = true
				if (canAnchor) capturedTime = currentTime
			}
		})
	})

	$effect(() => {
		onDraftAnchorChange(content !== '' && anchored ? anchorTime : null)
	})

	/** Le bouton « À 0:42 » garde le repère qu'il affiche. */
	function chooseAnchored() {
		anchorChoice = 'anchored'
		// Saisie commencée sans position (lecteur pas encore lancé) : le repère se fige
		// maintenant. Avant la première frappe, il suit encore la lecture.
		if (draftStarted && capturedTime === null) capturedTime = currentTime
	}

	/** « Épingler à 1:58 » : la lecture a avancé, le repère la rejoint. */
	function retarget() {
		anchorChoice = 'anchored'
		capturedTime = currentTime
	}

	async function submitComment(event: SubmitEvent) {
		event.preventDefault()
		formError = null

		if (!content.trim()) {
			formError = 'Le commentaire est vide.'
			return
		}

		const ts = anchored && isFinite(anchorTime) ? anchorTime : null

		submitting = true
		try {
			const res = await fetch('/api/comments', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					[threadParam(thread)]: thread.id,
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

			await tick()
			list?.highlightComment(json.id)
		} catch {
			formError = 'Erreur réseau.'
		} finally {
			submitting = false
		}
	}

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
		if (!highlightRequest) return
		if (highlightRequest.token === lastHighlightToken) return

		lastHighlightToken = highlightRequest.token
		list?.highlightComment(highlightRequest.id)
	})
</script>

<section class="comments-section" class:inline>
	{#if !inline}
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
	{/if}

	{#if displayComments.length === 0}
		{#if !inline}<p class="empty">Pas encore de commentaire.</p>{/if}
	{:else}
		<div class="list-wrapper">
			<CommentList
				bind:this={list}
				comments={orderedComments}
				{thread}
				{onSeek}
				{maxVisible}
				compact={inline}
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
	<form id={inline ? undefined : 'commenter'} class="comment-form" onsubmit={submitComment} bind:this={form}>
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

				<button
					type="submit"
					class="send"
					disabled={submitting || !content.trim()}
					aria-label="Envoyer le commentaire"
					title="Envoyer (Ctrl/⌘+Entrée)"
				>
					{#if submitting}…{:else}<Icon name="send" size="0.95rem" />{/if}
				</button>
			</div>
		</div>

		<!-- Deux choix nommés plutôt qu'une pastille à allumer : on lit où le commentaire se
		     posera sans avoir à deviner ce que veut dire une couleur. -->
		{#if anchorable && playerReady && anchorTime > 0}
			<div class="anchor-row">
				<div class="anchor-toggle" role="group" aria-label="Où poser le commentaire">
					<button
						type="button"
						class:active={anchored}
						aria-pressed={anchored}
						title="Le commentaire s'épingle à ce moment : un repère apparaît sur le lecteur, et un clic y ramène"
						disabled={submitting}
						onclick={chooseAnchored}
					>
						<Icon name="clock" size="0.8rem" /> À {formatTime(anchorTime)}
					</button>
					<button
						type="button"
						class:active={!anchored}
						aria-pressed={!anchored}
						title="Le commentaire porte sur l'ensemble, sans repère"
						disabled={submitting}
						onclick={() => (anchorChoice = 'general')}
					>Général</button>
				</div>
				{#if canRetarget}
					<button type="button" class="btn-link retarget" disabled={submitting} onclick={retarget}>
						Épingler à {formatTime(currentTime)}
					</button>
				{/if}
			</div>
		{/if}
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
		border-radius: var(--radius-pill);
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

	/* Même plateau creusé que le tiroir d'une prise (`track-after`, TrackRow) : les commentaires
	   se lisent au même endroit visuel des deux côtés. Posés à plat sur la page, dont
	   ils portaient déjà le fond, seul leur filet les en séparait — et rien ne disait
	   où finissait la liste et où commençait la saisie. Le fond de surface de la
	   charte, celui de `.form-section`. */
	.list-wrapper {
		margin-bottom: 1.5rem;
		padding: var(--space-3);
		background: var(--color-bg-subtle);
		border: 1px solid var(--color-border-light);
		border-radius: var(--radius-xl);
	}

	/* Sous une carte du fil, la discussion est une suite de la carte, pas une section */
	.inline .list-wrapper {
		margin-bottom: var(--space-3);
		padding: var(--space-2);
	}

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

	/* Même grammaire que le choix d'ordre de la liste : deux boutons accolés, l'actif
	   en orange pâle. */
	.anchor-row {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.3rem 0.75rem;
	}

	.anchor-toggle {
		display: inline-flex;
		border: 1px solid var(--color-border-light);
		border-radius: var(--radius-pill);
		overflow: hidden;
	}

	.anchor-toggle button {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		background: none;
		border: none;
		padding: 0.25rem 0.7rem;
		font: inherit;
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
		color: var(--color-text-secondary);
		cursor: pointer;
	}

	.anchor-toggle button + button { border-left: 1px solid var(--color-border-light); }

	.anchor-toggle button:hover:not(:disabled):not(.active) { background: var(--color-bg-muted); }

	.anchor-toggle button.active {
		background: var(--color-accent-light);
		color: var(--color-accent);
		font-weight: 600;
	}

	.retarget { font-size: var(--text-xs); font-variant-numeric: tabular-nums; }

	/* Au doigt, une cible de 34 px se rate : le bouton d'envoi grandit. */
	@media (max-width: 640px) {
		.send { width: 40px; height: 40px; font-size: var(--text-base); }
		.anchor-toggle button { padding: 0.45rem 0.85rem; }
	}
</style>
