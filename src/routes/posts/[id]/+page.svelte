<script lang="ts">
	import type { PageData } from './$types'
	import { onMount, tick } from 'svelte'
	import { goto, invalidateAll } from '$app/navigation'
	import { page } from '$app/state'
	import { formatDateTimeFull } from '$lib/date'
	import MediaPlayer from '$lib/components/MediaPlayer.svelte'
	import CommentsPanel from '$lib/components/CommentsPanel.svelte'
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte'
	import YouTubeEmbed from '$lib/components/YouTubeEmbed.svelte'
	import PostReactions from '$lib/components/PostReactions.svelte'
	import Icon from '$lib/components/Icon.svelte'
	import type { MentionMember } from '$lib/components/MentionTextarea.svelte'
	import { parseTimecode } from '$lib/youtube'
	import {
		canDeleteGroupContent,
		canEditPost,
		personalAudioUrl,
		postPlayable,
		postKindLabel,
		postTitle,
		type CommentWithReactions,
		type PostView,
		type ReactionSummary
	} from '$lib/types'

	let { data }: { data: PageData } = $props()

	const post = $derived(data.post as unknown as PostView)
	let comments = $derived(data.comments as unknown as CommentWithReactions[])
	const groupMembers = $derived(data.groupMembers as unknown as MentionMember[])
	const title = $derived(postTitle(post))
	const kindLabel = $derived(postKindLabel(post))
	const playable = $derived(postPlayable(post))
	// Une suggestion porte sa vidéo comme une citation : pas de lecteur à ancrer, une vignette.
	const isSuggestion = $derived(post.type === 'song_suggestion')

	const canEdit = $derived(canEditPost(data.user, post.author_user_id))
	const canDelete = $derived(canDeleteGroupContent(data.user, data.user?.current_group_id, post.author_user_id))

	// ─── Lecteur et commentaires ───────────────────────────────────────────
	type PlayerState = { currentTime: number; duration: number; isPlaying: boolean; ready: boolean }
	let playerState = $state<PlayerState>({ currentTime: 0, duration: 0, isPlaying: false, ready: false })
	let seekToken = $state(0)
	let seekRequest = $state<{ seconds: number; token: number } | null>(null)
	let highlightToken = $state(0)
	let highlightRequest = $state<{ id: number; token: number } | null>(null)

	function seekTo(seconds: number) {
		seekToken += 1
		seekRequest = { seconds, token: seekToken }
	}

	function formatTime(s: number) {
		const m = Math.floor(s / 60)
		return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`
	}

	const markers = $derived(
		comments
			.filter((c) => c.timestamp_s !== null && c.timestamp_s !== undefined)
			.map((c) => ({ id: c.id, time: c.timestamp_s as number, label: `${formatTime(c.timestamp_s as number)} — ${c.author}` }))
	)

	// Mêmes adresses que la page d'une prise : `?t=` pour le passage, `#comment-<id>`.
	onMount(() => {
		const t = parseTimecode(page.url.searchParams.get('t'))
		if (t !== null && playable) seekTo(t)
		const targeted = location.hash.match(/^#comment-(\d+)$/)
		if (targeted) {
			highlightToken += 1
			highlightRequest = { id: Number(targeted[1]), token: highlightToken }
		}
	})

	// ─── Message ───────────────────────────────────────────────────────────
	let editing = $state(false)
	let messageDraft = $state('')
	let saving = $state(false)
	let actionError = $state<string | null>(null)
	let messageField = $state<HTMLTextAreaElement | null>(null)

	async function startEdit() {
		messageDraft = post.message ?? ''
		actionError = null
		editing = true
		await tick()
		messageField?.focus()
	}

	async function saveMessage() {
		saving = true
		actionError = null
		try {
			const res = await fetch(`/api/posts/${post.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: messageDraft.trim() || null })
			})
			const json = await res.json().catch(() => ({}))
			if (!res.ok) { actionError = json.error ?? `Erreur ${res.status}`; return }
			editing = false
			await invalidateAll()
		} catch {
			actionError = 'Erreur réseau.'
		} finally {
			saving = false
		}
	}

	// ─── Suggestion → référentiel ──────────────────────────────────────────
	let addingSong = $state(false)

	async function addToSongs() {
		addingSong = true
		actionError = null
		try {
			const res = await fetch(`/api/posts/${post.id}/song`, { method: 'POST' })
			const json = await res.json().catch(() => ({}))
			if (res.ok) { await invalidateAll(); return }
			// Déjà là : on y mène plutôt que d'afficher une erreur sans issue.
			if (res.status === 409 && json.song_id) { await goto(`/songs/${json.song_id}`); return }
			actionError = json.error ?? `Erreur ${res.status}`
		} catch {
			actionError = 'Erreur réseau.'
		} finally {
			addingSong = false
		}
	}

	// ─── Suppression ───────────────────────────────────────────────────────
	let confirmDeleteOpen = $state(false)
	let deleting = $state(false)

	async function deletePost() {
		deleting = true
		try {
			const res = await fetch(`/api/posts/${post.id}`, { method: 'DELETE' })
			if (!res.ok) {
				const json = await res.json().catch(() => ({}))
				actionError = json.error ?? `Erreur ${res.status}`
				return
			}
			await goto('/')
		} finally {
			deleting = false
			confirmDeleteOpen = false
		}
	}

	const deleteMessage = $derived(
		`La publication et ${comments.length > 0 ? `ses ${comments.length} commentaire${comments.length > 1 ? 's' : ''}` : 'sa discussion'} seront définitivement supprimées.` +
			(post.type === 'recording' ? ' L’enregistrement reste dans l’espace perso de son auteur.' : '')
	)
</script>

<svelte:head>
	<title>{title}</title>
</svelte:head>

<main>
	<nav class="breadcrumb">
		<a href="/">Tableau de bord</a> / <span>{kindLabel}</span>
	</nav>

	<div class="header">
		<div class="header-text">
			<span class="type-badge">{kindLabel}</span>
			<h1>{title}</h1>
			{#if isSuggestion && post.song_artist}<p class="artist">{post.song_artist}</p>{/if}
			<p class="meta">
				publié par {post.author} le {formatDateTimeFull(post.created_at)}
				{#if post.edited_at}<span title={`Modifié le ${formatDateTimeFull(post.edited_at)}`}>(modifié)</span>{/if}
			</p>
		</div>
		<div class="header-actions">
			{#if canEdit && !editing}
				<button class="btn btn-secondary btn-sm" onclick={startEdit}>Modifier le message</button>
			{/if}
			{#if canDelete}
				<button class="btn btn-danger btn-sm" disabled={deleting} onclick={() => (confirmDeleteOpen = true)}>Supprimer</button>
			{/if}
		</div>
	</div>

	{#if editing}
		<div class="message-editor">
			<textarea
				class="form-input"
				rows="3"
				maxlength="2000"
				bind:value={messageDraft}
				bind:this={messageField}
				disabled={saving}
				placeholder="Ce que tu veux que le groupe en retienne…"
				onkeydown={(e) => {
					if (e.key === 'Escape') editing = false
					else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveMessage()
				}}
			></textarea>
			<div class="editor-actions">
				<button class="btn btn-primary btn-sm" onclick={saveMessage} disabled={saving}>{saving ? 'Sauvegarde…' : 'Valider'}</button>
				<button class="btn btn-ghost btn-sm" onclick={() => (editing = false)} disabled={saving}>Annuler</button>
			</div>
		</div>
	{:else if post.message}
		<p class="message">{post.message}</p>
	{/if}

	{#if actionError}<p class="message-error">{actionError}</p>{/if}

	{#if isSuggestion}
		<div class="suggestion">
			{#if post.youtube_video_id}
				<YouTubeEmbed videoId={post.youtube_video_id} />
			{/if}
			<div class="suggestion-actions">
				{#if post.song_id !== null}
					<a class="btn btn-secondary btn-sm" href="/songs/{post.song_id}"><Icon name="music" size="0.85rem" /> Voir le morceau</a>
					<span class="hint">Au référentiel, en proposition de travail.</span>
				{:else if data.existingSongId}
					<a class="btn btn-secondary btn-sm" href="/songs/{data.existingSongId}"><Icon name="music" size="0.85rem" /> Voir le morceau</a>
					<span class="hint">Un morceau de ce titre est déjà au référentiel.</span>
				{:else}
					<button class="btn btn-primary btn-sm" onclick={addToSongs} disabled={addingSong}>
						<Icon name="plus" size="0.85rem" /> {addingSong ? 'Ajout…' : 'Ajouter au référentiel'}
					</button>
					<span class="hint">Il y entrera en « proposition de travail ».</span>
				{/if}
			</div>
		</div>
	{:else if playable}
		<div class="player-card">
			<MediaPlayer
				trackId={`post-${post.id}`}
				audioSrc={post.recording_has_audio && post.personal_recording_id !== null ? personalAudioUrl(post.personal_recording_id) : null}
				peaks={data.peaks as number[]}
				duration={post.recording_duration_s ?? (data.peaksDuration as number | null)}
				videoId={post.youtube_video_id}
				{markers}
				{seekRequest}
				onStateChange={(state) => (playerState = state)}
				onMarkerSelect={(markerId) => {
					highlightToken += 1
					highlightRequest = { id: Number(markerId), token: highlightToken }
				}}
			/>
		</div>
		{#if post.type === 'recording'}
			<!-- Écouté ici comme une prise, mais absent des sessions et des morceaux : sans ce
			     rappel, on le cherche ensuite là où il n'est pas. -->
			<p class="hint origin">
				{#if data.user?.id === post.author_user_id && post.personal_recording_id !== null}
					Ton enregistrement perso, pas encore une prise du groupe.
					<a href="/perso/{post.personal_recording_id}?classer">Le classer dans une session</a>
					— cette publication et ses commentaires partiront avec lui.
				{:else}
					Enregistrement perso de {post.author}, pas une prise du groupe : il n'apparaît ni
					dans les sessions ni dans les morceaux. Seul son auteur peut le classer dans une session.
				{/if}
			</p>
		{/if}
	{/if}

	<div class="reactions">
		<PostReactions postId={post.id} reactions={data.reactions as unknown as ReactionSummary} />
	</div>

	<div class="comments">
		<CommentsPanel
			thread={{ kind: 'post', id: post.id, anchorable: playable }}
			{comments}
			members={groupMembers}
			currentTime={playerState.currentTime}
			playerReady={playerState.ready}
			isPlaying={playerState.isPlaying}
			{highlightRequest}
			onSeek={seekTo}
			onCommentsChange={(updated) => { comments = updated }}
		/>
	</div>

	<ConfirmDialog
		open={confirmDeleteOpen}
		level="danger"
		title="Supprimer cette publication ?"
		message={deleteMessage}
		confirmLabel="Supprimer la publication"
		busy={deleting}
		onConfirm={deletePost}
		onCancel={() => (confirmDeleteOpen = false)}
	/>
</main>

<style>
	main { max-width: 720px; margin: 2rem auto; padding: 0 1rem; }

	.header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
	.header-text { min-width: 0; }
	.type-badge {
		display: inline-block; font-size: var(--text-xs); font-weight: 600; text-transform: uppercase;
		letter-spacing: 0.03em; color: var(--color-text-secondary); margin-bottom: 0.2rem;
	}
	h1 { font-size: 1.4rem; margin: 0 0 0.2rem; overflow-wrap: anywhere; }
	.artist { margin: 0 0 0.2rem; color: var(--color-text-secondary); }
	.meta { font-size: var(--text-xs); color: var(--color-text-muted); margin: 0; }
	.header-actions { display: flex; gap: 0.4rem; flex-shrink: 0; flex-wrap: wrap; }

	.message {
		margin: 0 0 1.25rem; padding: 0.75rem 1rem; white-space: pre-line;
		background: var(--color-bg-subtle); border-left: 3px solid var(--color-accent); border-radius: var(--radius-md, 6px);
	}
	.message-editor { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1.25rem; }
	.message-editor textarea { resize: vertical; }
	.editor-actions { display: flex; gap: 0.5rem; }

	.player-card { border: 1px solid var(--color-border-light); border-radius: var(--radius-lg); padding: 0.9rem; }

	.suggestion { display: flex; flex-direction: column; gap: 0.75rem; }
	.suggestion-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 0.5rem 0.75rem; }
	.hint { font-size: var(--text-xs); color: var(--color-text-muted); }

	.origin { margin: 0.5rem 0 0; }

	.reactions { margin-top: var(--space-4); }

	.comments { margin-top: var(--space-5); padding-top: var(--space-5); border-top: 1px solid var(--color-border-light); }

	@media (max-width: 640px) {
		main { margin: 1rem auto; padding: 0 0.75rem; }
		.header { flex-direction: column; align-items: stretch; }
	}
</style>
