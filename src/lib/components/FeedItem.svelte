<script lang="ts">
	import { goto } from '$app/navigation'
	import { formatDateOnly, formatDateTime, formatDateTimeFull } from '$lib/date'
	import CommentsPanel from '$lib/components/CommentsPanel.svelte'
	import PostReactions from '$lib/components/PostReactions.svelte'
	import RecordingPlaybackActions from '$lib/components/RecordingPlaybackActions.svelte'
	import YouTubeEmbed from '$lib/components/YouTubeEmbed.svelte'
	import Icon from '$lib/components/Icon.svelte'
	import type { MentionMember } from '$lib/components/MentionTextarea.svelte'
	import { formatTimecode } from '$lib/youtube'
	import {
		formatSetlistDuration,
		personalAudioUrl,
		postKindLabel,
		postTitle,
		sessionTypeLabel,
		type FeedItem
	} from '$lib/types'

	let { item, members }: { item: FeedItem; members: MentionMember[] } = $props()

	/** Au-delà, une carte de prises renvoie à la session : elle annonce, elle ne liste pas tout. */
	const RECORDINGS_SHOWN = 5
	const SONG_PILLS_SHOWN = 8

	const initials = $derived(
		item.author
			.split(/\s+/)
			.map((part) => part[0] ?? '')
			.join('')
			.slice(0, 2)
			.toUpperCase()
	)

	// Ce que l'auteur a fait, dit comme une phrase : c'est la ligne qu'on lit en premier.
	const action = $derived.by(() => {
		switch (item.kind) {
			case 'post': {
				if (item.post.type === 'song_suggestion') return 'suggère un morceau'
				return postKindLabel(item.post) === 'Vidéo' ? 'a partagé une vidéo' : 'a partagé un enregistrement'
			}
			case 'session': return 'a créé une session'
			case 'recordings': {
				const n = item.recordings.length
				return n === 1 ? 'a ajouté une prise' : `a ajouté ${n} prises`
			}
			case 'setlist': return 'a créé une setlist'
			case 'playlist': return 'a créé une playlist'
		}
	})

	const href = $derived.by(() => {
		switch (item.kind) {
			case 'post': return `/posts/${item.post.id}`
			case 'session': return `/sessions/${item.session.id}`
			case 'recordings': return `/sessions/${item.session.id}`
			case 'setlist': return `/setlists/${item.setlist.id}`
			case 'playlist': return `/playlists/${item.playlist.id}`
		}
	})

	function sessionLabel(session: { date: string; type: string; title: string | null }) {
		const date = formatDateOnly(session.date, { day: 'numeric', month: 'long', year: 'numeric' })
		return session.title ? `${session.title} (${date})` : `${sessionTypeLabel(session.type)} du ${date}`
	}

	// ─── Suggestion → référentiel ──────────────────────────────────────────
	// $derived inscriptible : l'ajout depuis la carte la met à jour sans recharger le fil.
	let suggestionSongId = $derived(item.kind === 'post' ? item.post.song_id : null)
	let addingSong = $state(false)
	let addError = $state<string | null>(null)

	async function addToSongs(postId: number) {
		addingSong = true
		addError = null
		try {
			const res = await fetch(`/api/posts/${postId}/song`, { method: 'POST' })
			const json = await res.json().catch(() => ({}))
			if (res.ok) { suggestionSongId = json.song_id; return }
			// Déjà là : on y mène plutôt que d'afficher une erreur sans issue.
			if (res.status === 409 && json.song_id) { await goto(`/songs/${json.song_id}`); return }
			addError = json.error ?? `Erreur ${res.status}`
		} catch {
			addError = 'Erreur réseau.'
		} finally {
			addingSong = false
		}
	}
</script>

<article class="feed-card">
	<header class="card-head">
		<span class="avatar" aria-hidden="true">{initials}</span>
		<div class="head-text">
			<p class="head-line"><strong>{item.author}</strong> {action}</p>
			<a class="head-time" href={href} title={formatDateTimeFull(item.at)}>{formatDateTime(item.at)}</a>
		</div>
	</header>

	{#if item.kind === 'post'}
		{@const post = item.post}
		{#if post.message}<p class="message">{post.message}</p>{/if}

		{#if post.type === 'song_suggestion'}
			<div class="suggestion">
				<p class="suggestion-title"><Icon name="music" size="1rem" /> <strong>{post.song_title}</strong>{#if post.song_artist}<span class="muted"> — {post.song_artist}</span>{/if}</p>
				{#if post.youtube_video_id}<YouTubeEmbed videoId={post.youtube_video_id} />{/if}
				<div class="suggestion-actions">
					{#if suggestionSongId !== null}
						<a class="btn btn-secondary btn-sm" href="/songs/{suggestionSongId}"><Icon name="music" size="0.85rem" /> Voir le morceau</a>
					{:else}
						<button class="btn btn-secondary btn-sm" onclick={() => addToSongs(post.id)} disabled={addingSong}>
							<Icon name="plus" size="0.85rem" /> {addingSong ? 'Ajout…' : 'Ajouter au référentiel'}
						</button>
					{/if}
					{#if addError}<span class="error">{addError}</span>{/if}
				</div>
			</div>
		{:else}
			<a class="media-title" href="/posts/{post.id}">{postTitle(post)}</a>
			{#if post.recording_has_audio && post.personal_recording_id !== null}
				<!-- Lecteur natif, chargé au clic : un fil peut porter dix enregistrements, et une
				     waveform par carte coûterait dix fichiers avant qu'on ait choisi quoi écouter.
				     La page de la publication garde la waveform et l'ancrage des commentaires. -->
				<audio class="audio" controls preload="none" src={personalAudioUrl(post.personal_recording_id)}></audio>
			{/if}
			{#if post.youtube_video_id}<YouTubeEmbed videoId={post.youtube_video_id} />{/if}
		{/if}

		<div class="card-actions">
			<PostReactions postId={post.id} reactions={item.reactions} />
		</div>

		<div class="card-comments">
			<CommentsPanel thread={{ kind: 'post', id: post.id, anchorable: false }} comments={item.comments} {members} inline />
		</div>

	{:else if item.kind === 'session'}
		{@const session = item.session}
		<a class="block-link" href="/sessions/{session.id}">
			<span class="badge">{sessionTypeLabel(session.type)}</span>
			<span class="block-title">{sessionLabel(session)}</span>
			{#if session.location}<span class="muted">{session.location}</span>{/if}
		</a>
		{#if session.song_titles.length > 0}
			<div class="pills">
				{#each session.song_titles.slice(0, SONG_PILLS_SHOWN) as title}<span class="pill">{title}</span>{/each}
				{#if session.song_titles.length > SONG_PILLS_SHOWN}<span class="pill muted">+{session.song_titles.length - SONG_PILLS_SHOWN}</span>{/if}
			</div>
		{/if}
		{#if session.recording_count > 0}
			<p class="muted small">{session.recording_count} prise{session.recording_count > 1 ? 's' : ''}</p>
		{/if}

	{:else if item.kind === 'recordings'}
		<p class="context">dans <a href="/sessions/{item.session.id}">{sessionLabel(item.session)}</a></p>
		<ul class="takes">
			{#each item.recordings.slice(0, RECORDINGS_SHOWN) as rec (rec.id)}
				<li class="take">
					<div class="take-text">
						<a class="take-song" href="/recording/{rec.id}">
							{#if rec.has_video}<Icon name="video" size="0.85rem" label="Vidéo" />{/if}
							{rec.song_title}
						</a>
						<span class="muted small">
							Prise {rec.take}{#if rec.duration_s} · {formatTimecode(rec.duration_s)}{/if}
							{#if rec.comment_count > 0}
								· <a class="muted" href="/recording/{rec.id}#commenter"><Icon name="comment" size="0.8rem" /> {rec.comment_count}</a>
							{/if}
						</span>
					</div>
					<RecordingPlaybackActions
						recordingId={rec.id}
						songId={rec.song_id}
						songTitle={rec.song_title}
						take={rec.take}
						sessionDate={item.session.date}
						durationS={rec.duration_s}
						hasAudio={rec.has_audio}
					/>
				</li>
			{/each}
		</ul>
		{#if item.recordings.length > RECORDINGS_SHOWN}
			<a class="more" href="/sessions/{item.session.id}">
				Voir les {item.recordings.length - RECORDINGS_SHOWN} autres prises dans la session →
			</a>
		{/if}

	{:else if item.kind === 'setlist'}
		{@const setlist = item.setlist}
		<a class="block-link" href="/setlists/{setlist.id}">
			<span class="block-title">{setlist.name}</span>
			<span class="muted">
				{setlist.song_count} morceau{setlist.song_count > 1 ? 'x' : ''}
				{#if setlist.song_count > 0} · {formatSetlistDuration({ total_s: setlist.total_duration_s, missing: setlist.missing_duration_count })}{/if}
			</span>
		</a>
		{#if setlist.description}<p class="message">{setlist.description}</p>{/if}
		{#if setlist.song_titles.length > 0}
			<ol class="programme">
				{#each setlist.song_titles.slice(0, SONG_PILLS_SHOWN) as title}<li>{title}</li>{/each}
			</ol>
			{#if setlist.song_titles.length > SONG_PILLS_SHOWN}
				<a class="more" href="/setlists/{setlist.id}">Voir tout le programme →</a>
			{/if}
		{/if}

		<div class="card-comments">
			<CommentsPanel thread={{ kind: 'setlist', id: setlist.id }} comments={item.comments} {members} inline />
		</div>

	{:else if item.kind === 'playlist'}
		{@const playlist = item.playlist}
		<a class="block-link" href="/playlists/{playlist.id}">
			<span class="block-title"><Icon name="playlist" size="0.95rem" /> {playlist.name}</span>
			<span class="muted">{playlist.item_count} prise{playlist.item_count > 1 ? 's' : ''}</span>
		</a>
		{#if playlist.description}<p class="message">{playlist.description}</p>{/if}
	{/if}
</article>

<style>
	.feed-card {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-4);
		background: var(--color-bg);
		border: 1px solid var(--color-border-light);
		border-radius: var(--radius-lg);
	}

	.card-head { display: flex; align-items: center; gap: 0.65rem; }

	.avatar {
		flex-shrink: 0;
		display: grid;
		place-items: center;
		width: 2.2rem;
		height: 2.2rem;
		border-radius: 50%;
		background: var(--color-accent-light);
		color: var(--color-accent);
		font-size: var(--text-xs);
		font-weight: 700;
	}

	.head-text { min-width: 0; }
	.head-line { margin: 0; font-size: var(--text-sm); overflow-wrap: anywhere; }
	.head-time { font-size: var(--text-xs); color: var(--color-text-muted); text-decoration: none; }
	.head-time:hover { text-decoration: underline; }

	.message { margin: 0; white-space: pre-line; overflow-wrap: anywhere; }

	.media-title { font-weight: 600; color: inherit; text-decoration: none; overflow-wrap: anywhere; }
	.media-title:hover { color: var(--color-accent); }
	.audio { width: 100%; }

	.suggestion {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-3);
		background: var(--color-bg-subtle);
		border-radius: var(--radius-md);
	}
	.suggestion-title { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; margin: 0; }
	.suggestion-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 0.5rem; }

	.card-actions { padding-top: var(--space-2); border-top: 1px solid var(--color-border-light); }

	.block-link {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		padding: var(--space-3);
		border: 1px solid var(--color-border-light);
		border-radius: var(--radius-md);
		color: inherit;
		text-decoration: none;
	}
	.block-link:hover { border-color: var(--color-accent); background: var(--color-paper); }
	.block-title { display: inline-flex; align-items: center; gap: 0.35rem; font-weight: 600; overflow-wrap: anywhere; }

	.badge {
		align-self: flex-start;
		font-size: var(--text-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: var(--color-text-secondary);
	}

	.pills { display: flex; flex-wrap: wrap; gap: 0.3rem; }
	.pill {
		padding: 0.1rem 0.55rem;
		border-radius: 999px;
		background: var(--color-bg-subtle);
		font-size: var(--text-xs);
	}

	.context { margin: 0; font-size: var(--text-sm); color: var(--color-text-secondary); }

	.takes { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
	.take {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.45rem 0;
		border-top: 1px solid var(--color-border-light);
	}
	.take:first-child { border-top: none; }
	.take-text { display: flex; flex-direction: column; min-width: 0; }
	.take-song {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-weight: 600;
		color: inherit;
		text-decoration: none;
		overflow-wrap: anywhere;
	}
	.take-song:hover { color: var(--color-accent); }

	.programme { margin: 0; padding-left: 1.4rem; font-size: var(--text-sm); }

	.more { font-size: var(--text-sm); }

	.muted { color: var(--color-text-muted); }
	.small { font-size: var(--text-xs); margin: 0; }
	.error { font-size: var(--text-xs); color: var(--color-error); }

	@media (max-width: 640px) {
		.feed-card { padding: var(--space-3); }
	}
</style>
