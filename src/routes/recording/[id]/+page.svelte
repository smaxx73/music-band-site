<script lang="ts">
	import type { PageData } from './$types'
	import { onMount, tick, untrack } from 'svelte'
	import { page } from '$app/state'
	import { invalidateAll } from '$app/navigation'
	import { player } from '$lib/player.svelte'
	import { formatDateOnly } from '$lib/date'
	import AudioPlayer from '$lib/components/AudioPlayer.svelte'
	import CommentsPanel from '$lib/components/CommentsPanel.svelte'
	import SongDetails from '$lib/components/SongDetails.svelte'
	import AddToPlaylistButton from '$lib/components/AddToPlaylistButton.svelte'
	import YouTubePlayer from '$lib/components/YouTubePlayer.svelte'
	import { youtubeWatchUrl, formatTimecode, parseTimecode } from '$lib/youtube'
	import type { CommentWithReactions } from '$lib/types'
	import Icon from '$lib/components/Icon.svelte'
	import SongSelect from '$lib/components/SongSelect.svelte'
	import ShareLinkDialog from '$lib/components/ShareLinkDialog.svelte'
	import { canSharePublicly } from '$lib/types'
	import { isPlaceholderSongTitle, sortedWithSong } from '$lib/songs'

	let { data }: { data: PageData } = $props()

	type Recording = {
		id: number; take: number; status: string; notes: string | null
		duration_s: number | null; uploaded_by: string; session_id: number; song_id: number
		file_path: string | null; source_file_name: string | null
		youtube_video_id: string | null; youtube_title: string | null
		song_title: string; song_composer: string | null; song_key: string | null
		song_lyrics: string | null; song_music_notes: string | null
		session_date: string; session_location: string | null
	}
	type Comment = CommentWithReactions
	type MentionMember = { id: number; nickname: string; display_name: string }

	// $derived inscriptible : la note enregistrée s'affiche tout de suite, et `data`
	// reprend la main à la prochaine navigation.
	let recording = $derived(data.recording as unknown as Recording)
	// Une prise a une piste audio, une vidéo YouTube, ou les deux.
	const hasAudio = $derived(!!recording.file_path)
	// Avec les deux, l'audio s'affiche d'abord : c'est lui que jouent la barre du bas et les
	// playlists. $derived inscriptible : l'onglet revient à l'audio en changeant de prise.
	let view = $derived<'audio' | 'video'>(recording.file_path ? 'audio' : 'video')
	const showVideo = $derived(!!recording.youtube_video_id && view === 'video')
	let comments = $derived(data.comments as unknown as Comment[])
	const groupMembers = $derived(data.groupMembers as unknown as MentionMember[])

	type PlayerState = {
		currentTime: number
		duration: number
		isPlaying: boolean
		ready: boolean
	}

	let playerState = $state<PlayerState>({
		currentTime: 0,
		duration: 0,
		isPlaying: false,
		ready: false
	})
	let seekToken = $state(0)
	let seekRequest = $state<{ seconds: number; token: number } | null>(null)
	let highlightToken = $state(0)
	let highlightRequest = $state<{ id: number; token: number } | null>(null)

	function formatTime(s: number) {
		if (!isFinite(s)) return '0:00'
		const m = Math.floor(s / 60)
		const sec = Math.floor(s % 60)
		return `${m}:${String(sec).padStart(2, '0')}`
	}

	function formatDate(d: string | Date) {
		return formatDateOnly(d, {
			day: 'numeric', month: 'long', year: 'numeric'
		})
	}

	function seekTo(seconds: number) {
		seekToken += 1
		seekRequest = { seconds, token: seekToken }
	}

	type SiblingRecording = { id: number; take: number } | null
	const prevRecording = $derived(data.prevRecording as SiblingRecording)
	const nextRecording = $derived(data.nextRecording as SiblingRecording)

	const playerTrack = $derived({
		id: recording.id,
		src: `/audio/${recording.id}.mp3`,
		peaks: data.peaks as number[],
		duration: (recording.duration_s ?? (data as { peaksDuration?: number | null }).peaksDuration) ?? undefined
	})

	// La page devient la vue détaillée du lecteur partagé : arriver ici sur la prise
	// déjà en cours ne coupe pas la lecture, `load` ne retouche pas le `src`.
	// Une prise sans piste audio a son propre lecteur et laisse le lecteur partagé tranquille.
	$effect(() => {
		const r = recording
		if (!r.file_path) return
		untrack(() =>
			player.load({
				recordingId: r.id,
				songId: r.song_id,
				songTitle: r.song_title,
				take: r.take,
				sessionDate: String(r.session_date),
				durationS: r.duration_s
			})
		)
	})

	// Dès que la prise a sa piste audio, la page la pilote seule, onglet Vidéo compris : la
	// barre du bas y rejouerait la même prise en double, et les commentaires suivent le
	// lecteur affiché, pas la barre.
	$effect(() => {
		if (!hasAudio) return
		player.attachView()
		return () => player.detachView()
	})

	// Un seul lecteur actif à l'écran. Revenir à l'audio n'a rien à arrêter : le lecteur
	// vidéo est retiré de la page, et détruit avec lui.
	function selectView(next: 'audio' | 'video') {
		if (next === 'video') player.pause()
		view = next
	}

	// Note de la prise : les vues session et morceau l'affichent, mais renvoient ici
	// pour l'écrire — on écrit sur une prise là où on l'écoute, comme un commentaire.
	// `#notes` ouvre directement la saisie.
	let notesDraft = $state<string | null>(null)
	let notesSaving = $state(false)
	let notesError = $state<string | null>(null)
	let notesField = $state<HTMLTextAreaElement | null>(null)
	let notesBlock = $state<HTMLElement | null>(null)

	async function startEditNotes() {
		notesDraft = recording.notes ?? ''
		notesError = null
		await tick()
		notesField?.focus()
	}

	function cancelEditNotes() {
		notesDraft = null
		notesError = null
	}

	async function saveNotes() {
		const value = (notesDraft ?? '').trim()
		notesSaving = true
		notesError = null
		try {
			const res = await fetch(`/api/recordings/${recording.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ notes: value || null })
			})
			const json = await res.json()
			if (!res.ok) { notesError = json.error ?? 'Erreur.'; return }
			recording = { ...recording, notes: json.notes }
			notesDraft = null
		} catch {
			notesError = 'Erreur réseau.'
		} finally {
			notesSaving = false
		}
	}

	// --- Morceau de la prise ---
	//
	// Classée à la hâte, une prise tombe sous un morceau « À nommer — … », ou sous le
	// mauvais morceau. C'est ici qu'on s'en aperçoit, en l'écoutant : le corriger se
	// fait donc ici aussi, sans détour par /songs.
	let songs = $derived(data.songs as { id: number; title: string }[])
	const placeholderSong = $derived(isPlaceholderSongTitle(recording.song_title))

	let renameDraft = $state('')
	let renaming = $state(false)
	let renameError = $state<string | null>(null)
	// Le titre saisi est déjà celui d'un autre morceau : on propose d'y rattacher la prise.
	let renameClash = $state<{ id: number; title: string } | null>(null)

	let moveOpen = $state(false)
	let moveTarget = $state('')
	let moving = $state(false)
	let moveError = $state<string | null>(null)

	async function renameSong(e: SubmitEvent) {
		e.preventDefault()
		const title = renameDraft.trim()
		if (!title || renaming) return
		renameError = null
		renameClash = null
		const clash = songs.find(
			(s) => s.id !== recording.song_id && s.title.toLocaleLowerCase('fr') === title.toLocaleLowerCase('fr')
		)
		if (clash) { renameClash = clash; return }
		renaming = true
		try {
			const res = await fetch(`/api/songs/${recording.song_id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title })
			})
			const json = await res.json()
			if (!res.ok) { renameError = json.error ?? 'Erreur.'; return }
			renameDraft = ''
			await invalidateAll()
		} catch {
			renameError = 'Erreur réseau.'
		} finally {
			renaming = false
		}
	}

	async function moveTo(songId: string) {
		if (!songId || moving) return
		moving = true
		moveError = null
		try {
			const res = await fetch(`/api/recordings/${recording.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ song_id: Number(songId) })
			})
			const json = await res.json()
			if (!res.ok) { moveError = json.error ?? 'Erreur.'; return }
			moveOpen = false
			moveTarget = ''
			renameClash = null
			// Numéro de prise, prises voisines, fil d'Ariane : tout dépend du morceau.
			await invalidateAll()
		} catch {
			moveError = 'Erreur réseau.'
		} finally {
			moving = false
		}
	}

	// --- Liens entrants et lien à partager ---
	//
	// Ce qu'on partage d'une prise, c'est presque toujours un passage (« écoute à 1:23 »)
	// ou un commentaire précis. Les deux s'adressent donc dans l'URL : `?t=` pour la
	// position, `#comment-<id>` pour le commentaire. La mécanique existait déjà à
	// l'intérieur de la page — marqueurs de la waveform, mise en évidence — il ne lui
	// manquait que d'être atteignable de l'extérieur.
	onMount(() => {
		const t = parseTimecode(page.url.searchParams.get('t'))
		// Le lecteur n'est pas encore prêt : il rejoue la demande dès qu'il l'est.
		if (t !== null) seekTo(t)

		const targeted = location.hash.match(/^#comment-(\d+)$/)
		if (targeted) {
			highlightToken += 1
			highlightRequest = { id: Number(targeted[1]), token: highlightToken }
		}

		if (location.hash !== '#notes') return
		notesBlock?.scrollIntoView({ block: 'center' })
		startEditNotes()
	})

	// Copier le lien plutôt que d'aller le chercher dans la barre d'adresse : sur
	// téléphone, c'est la manœuvre qui décourage de partager.
	let linkCopied = $state(false)
	let linkCopyFailed = $state(false)
	const shareTime = $derived(
		playerState.currentTime > 1 ? Math.floor(playerState.currentTime) : null
	)

	async function copyLink() {
		const target = new URL(`/recording/${recording.id}`, location.origin)
		// Le repère suit le lecteur : partager depuis 1:23 partage 1:23.
		if (shareTime !== null) target.searchParams.set('t', String(shareTime))
		linkCopied = false
		linkCopyFailed = false
		try {
			await navigator.clipboard.writeText(target.toString())
			linkCopied = true
			setTimeout(() => (linkCopied = false), 2000)
		} catch {
			// Presse-papiers refusé (contexte non sécurisé, permission) : l'URL reste
			// dans la barre d'adresse, on ne fait que le dire.
			linkCopyFailed = true
			setTimeout(() => (linkCopyFailed = false), 3000)
		}
	}

	// Lien d'écoute public : tout membre peut faire entendre une prise hors du groupe.
	// Le compteur reste visible de tous — une prise écoutable au dehors ne doit pas
	// l'être à l'insu des autres membres.
	let shareOpen = $state(false)
	let shareCount = $derived(data.shareCount as number)
	const canShare = $derived(
		hasAudio && !!data.user?.current_group_id && canSharePublicly(data.user, { groupId: data.user.current_group_id })
	)

	// Le lecteur reste à l'écran pendant qu'on lit les commentaires : la waveform et ses
	// marqueurs sont l'index de la discussion, ils n'ont pas à disparaître au premier
	// défilement. Il ne se colle que s'il laisse de quoi lire — une vidéo 16/9 sur un
	// téléphone occuperait la moitié de l'écran.
	let innerHeight = $state(0)
	let playerHeight = $state(0)
	const stickyPlayer = $derived(
		playerHeight > 0 && innerHeight > 0 && playerHeight <= innerHeight * 0.45
	)

	const commentMarkers = $derived(
		comments
			.filter((comment) => comment.timestamp_s !== null && comment.timestamp_s !== undefined)
			.map((comment) => ({
				id: comment.id,
				time: comment.timestamp_s as number,
				label: `${formatTime(comment.timestamp_s as number)} — ${comment.author}`
			}))
	)
</script>

<svelte:head>
	<title>{recording.song_title} — Prise {recording.take}</title>
</svelte:head>

<svelte:window bind:innerHeight />

<main style="--comment-scroll-margin: {stickyPlayer ? playerHeight + 24 : 16}px">
	<!-- Fil d'Ariane -->
	<nav class="breadcrumb">
		<a href="/sessions">Sessions</a> /
		<a href="/sessions/{recording.session_id}">{formatDate(recording.session_date)}</a> /
		<a href="/songs/{recording.song_id}">{recording.song_title}</a> /
		<span>Prise {recording.take}</span>
	</nav>

	<!-- En-tête -->
	<div class="header">
		<div>
			<h1>
				<a href="/songs/{recording.song_id}" class="song-link">{recording.song_title}</a>
				{#if recording.song_key}<span class="key">{recording.song_key}</span>{/if}
			</h1>
			<div class="meta">
				Prise {recording.take} · {formatDate(recording.session_date)}
				{#if recording.session_location} · {recording.session_location}{/if}
				· {recording.uploaded_by}
			</div>
			{#if hasAudio}
				<!-- `file_path` ("{id}.mp3") ne sert de repli que pour les prises d'avant la
				     migration 023, déposées quand le nom d'origine n'était pas conservé. -->
				<div class="meta file-meta" class:fallback={!recording.source_file_name}>
					<Icon name="waveform" size="0.85rem" /> {recording.source_file_name ?? recording.file_path}
				</div>
			{/if}
			{#if recording.youtube_video_id}
				<div class="meta file-meta">
					<Icon name="video" size="0.85rem" /> <a href={youtubeWatchUrl(recording.youtube_video_id)} target="_blank" rel="noopener noreferrer">
						{recording.youtube_title ?? 'Vidéo YouTube'}
					</a>
				</div>
			{/if}

			<!-- Morceau provisoire ou mal choisi : se corrige là où on écoute la prise. -->
			{#if placeholderSong}
				<div class="song-fix">
					<p class="song-fix-title"><Icon name="pencil" size="0.85rem" /> Morceau à nommer</p>
					<form class="song-fix-row" onsubmit={renameSong}>
						<input
							class="form-input"
							type="text"
							bind:value={renameDraft}
							placeholder="Titre du morceau"
							aria-label="Titre du morceau"
							maxlength="200"
							disabled={renaming}
						/>
						<button type="submit" class="btn btn-primary btn-sm" disabled={renaming || !renameDraft.trim()}>
							{renaming ? 'Enregistrement…' : 'Renommer'}
						</button>
					</form>
					{#if renameClash}
						<p class="song-fix-hint">
							« {renameClash.title} » existe déjà.
							<button class="link-btn" onclick={() => moveTo(String(renameClash!.id))} disabled={moving}>
								Rattacher la prise à ce morceau
							</button>
						</p>
					{/if}
					{#if renameError}<p class="notes-error">{renameError}</p>{/if}
					{#if !moveOpen}
						<button class="link-btn" onclick={() => (moveOpen = true)}>
							C'est un morceau déjà au référentiel ?
						</button>
					{/if}
				</div>
			{:else if !moveOpen}
				<button class="link-btn change-song" onclick={() => (moveOpen = true)}>Changer de morceau</button>
			{/if}
			{#if moveOpen}
				<div class="song-fix">
					<SongSelect
						{songs}
						bind:value={moveTarget}
						oncreate={(song) => (songs = sortedWithSong(songs, song))}
						label="Rattacher la prise à"
						disabled={moving}
					/>
					<p class="song-fix-hint">Elle prendra le numéro de prise suivant de ce morceau.</p>
					<div class="song-fix-row">
						<button
							class="btn btn-primary btn-sm"
							onclick={() => moveTo(moveTarget)}
							disabled={moving || !moveTarget || Number(moveTarget) === recording.song_id}
						>
							{moving ? 'Déplacement…' : 'Déplacer la prise'}
						</button>
						<button class="btn btn-ghost btn-sm" onclick={() => { moveOpen = false; moveError = null }} disabled={moving}>
							Annuler
						</button>
					</div>
					{#if moveError}<p class="notes-error">{moveError}</p>{/if}
				</div>
			{/if}

			<!-- Note de la prise : c'est ici qu'elle s'écrit, les listes ne font que la lire. -->
			<div class="take-notes" id="notes" bind:this={notesBlock}>
				{#if notesDraft !== null}
					<textarea
						class="notes-field"
						rows="2"
						placeholder="Note sur cette prise…"
						bind:value={notesDraft}
						bind:this={notesField}
						disabled={notesSaving}
						onkeydown={(e) => {
							if (e.key === 'Escape') cancelEditNotes()
							else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveNotes()
						}}
					></textarea>
					<div class="notes-actions">
						<button class="btn btn-primary btn-sm" onclick={saveNotes} disabled={notesSaving}>
							{notesSaving ? 'Enregistrement…' : 'Enregistrer'}
						</button>
						<button class="btn btn-ghost btn-sm" onclick={cancelEditNotes} disabled={notesSaving}>Annuler</button>
						<span class="notes-hint">Ctrl/⌘+Entrée pour enregistrer</span>
					</div>
				{:else if recording.notes}
					<button class="notes-display" onclick={startEditNotes} title="Cliquer pour modifier">
						<Icon name="pencil" size="0.85rem" /> {recording.notes}
					</button>
				{:else}
					<button class="notes-add" onclick={startEditNotes}>
						<Icon name="plus" size="0.75rem" /><Icon name="pencil" size="0.85rem" /> Ajouter une note
					</button>
				{/if}
				{#if notesError}<p class="notes-error">{notesError}</p>{/if}
			</div>
		</div>
		<div class="header-actions">
			<a
				href="/sessions/{recording.session_id}"
				class="btn btn-ghost btn-sm back-to-session"
				title="Retourner à la session"
			>← Retour à la session</a>
			{#if prevRecording}
				<a href="/recording/{prevRecording.id}" class="btn btn-secondary btn-sm" title="Prise précédente">← Prise {prevRecording.take}</a>
			{/if}
			{#if nextRecording}
				<a href="/recording/{nextRecording.id}" class="btn btn-secondary btn-sm" title="Prise suivante">Prise {nextRecording.take} →</a>
			{/if}
			<button
				class="btn btn-secondary btn-sm"
				onclick={copyLink}
				title={shareTime !== null
					? `Copier le lien vers cette prise à ${formatTimecode(shareTime)}`
					: 'Copier le lien vers cette prise'}
			>
				{#if linkCopied}<Icon name="check" /> Lien copié
				{:else if linkCopyFailed}Copie impossible
				{:else}<Icon name="link" /> Copier le lien{#if shareTime !== null}&nbsp;({formatTimecode(shareTime)}){/if}
				{/if}
			</button>
			{#if canShare}
				<button
					class="btn btn-secondary btn-sm"
					class:shared={shareCount > 0}
					onclick={() => (shareOpen = true)}
					title="Faire écouter cette prise à quelqu'un qui n'a pas de compte"
				>
					<Icon name="globe" />
					{shareCount > 0 ? `Écoutable en public (${shareCount})` : 'Lien public'}
				</button>
			{/if}
			{#if hasAudio}
				<AddToPlaylistButton
					recordingId={recording.id}
					{hasAudio}
					label="Ajouter à une playlist"
					buttonClass="btn btn-secondary btn-sm"
				/>
			{/if}
		</div>
	</div>

	<SongDetails lyrics={recording.song_lyrics} musicNotes={recording.song_music_notes} compact />

	<!-- Lecteur -->
	<div class="player-card" class:sticky={stickyPlayer} bind:clientHeight={playerHeight}>
		{#if hasAudio && recording.youtube_video_id}
			<div class="view-tabs" role="tablist" aria-label="Lecteur">
				<button role="tab" class="view-tab" class:active={view === 'audio'} aria-selected={view === 'audio'} onclick={() => selectView('audio')}><Icon name="waveform" size="0.9rem" /> Audio</button>
				<button role="tab" class="view-tab" class:active={view === 'video'} aria-selected={view === 'video'} onclick={() => selectView('video')}><Icon name="video" size="0.9rem" /> Vidéo</button>
			</div>
		{/if}
		{#if showVideo && recording.youtube_video_id}
			<YouTubePlayer
				videoId={recording.youtube_video_id}
				markers={commentMarkers}
				seekRequest={seekRequest}
				onStateChange={(state) => {
					playerState = state
				}}
				onMarkerSelect={(markerId) => {
					highlightToken += 1
					highlightRequest = { id: Number(markerId), token: highlightToken }
				}}
			/>
		{:else}
			<AudioPlayer
				track={playerTrack}
				media={player.media}
				markers={commentMarkers}
				seekRequest={seekRequest}
				onStateChange={(state) => {
					playerState = state
				}}
				onMarkerSelect={(markerId) => {
					highlightToken += 1
					highlightRequest = { id: Number(markerId), token: highlightToken }
				}}
			/>
		{/if}
	</div>

	<CommentsPanel
		thread={{ kind: 'recording', id: recording.id }}
		comments={comments}
		members={groupMembers}
		currentTime={playerState.currentTime}
		playerReady={playerState.ready}
		isPlaying={playerState.isPlaying}
		highlightRequest={highlightRequest}
		onSeek={seekTo}
		onCommentsChange={(updatedComments) => {
			comments = updatedComments
		}}
	/>

	{#if shareOpen}
		<ShareLinkDialog
			target={{ kind: 'recording', id: recording.id }}
			onClose={() => (shareOpen = false)}
			onCountChange={(count) => (shareCount = count)}
		/>
	{/if}
</main>

<style>
	main {
		max-width: 720px;
		margin: 2rem auto;
		padding: 0 1rem;
	}

	.header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 1.25rem; }
	.header-actions { display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0; flex-wrap: wrap; justify-content: flex-end; }
	.header-actions .shared { border-color: var(--color-accent); color: var(--color-accent); }

	h1 {
		font-size: 1.4rem;
		margin: 0 0 0.3rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.song-link {
		color: inherit;
		text-decoration: none;
	}
	.song-link:hover { text-decoration: underline; }

	.key {
		font-size: 0.85rem;
		font-weight: 400;
		background: var(--color-abandoned-bg);
		color: var(--color-text-secondary);
		padding: 0.15rem 0.45rem;
		border-radius: var(--radius-sm);
	}

	.meta { font-size: 0.85rem; color: #666; }

	.file-meta { margin-top: 0.15rem; font-size: var(--text-xs); overflow-wrap: anywhere; }
	.file-meta.fallback { color: var(--color-text-muted); font-style: italic; }
	.file-meta a { color: inherit; }

	.song-fix {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.4rem;
		margin-top: 0.6rem;
		padding: 0.6rem 0.75rem;
		background: var(--color-bg-subtle);
		border: 1px solid var(--color-border-light);
		border-radius: var(--radius-md);
	}

	.song-fix :global(.song-select) { align-self: stretch; }

	.song-fix-title {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		margin: 0;
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.song-fix-row { display: flex; gap: 0.4rem; flex-wrap: wrap; align-self: stretch; }
	.song-fix-row input { flex: 1 1 12rem; min-width: 0; }

	.song-fix-hint { margin: 0; font-size: var(--text-xs); color: var(--color-text-muted); }

	.link-btn {
		background: none;
		border: none;
		padding: 0;
		font: inherit;
		font-size: var(--text-xs);
		color: var(--color-accent);
		cursor: pointer;
		text-decoration: underline;
	}

	.change-song { margin-top: 0.3rem; font-size: var(--text-xs); }

	/* Note de la prise : discrète tant qu'il n'y en a pas, lisible dès qu'il y en a une. */
	.take-notes { margin-top: 0.5rem; }

	.notes-display,
	.notes-add {
		display: block;
		max-width: 100%;
		background: none;
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		padding: 0.25rem 0.4rem;
		margin-left: -0.4rem;
		font-family: inherit;
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		text-align: left;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		cursor: pointer;
	}

	.notes-display:hover,
	.notes-add:hover { border-color: var(--color-border-light); background: var(--color-bg-subtle); }

	.notes-add { color: var(--color-text-muted); border-style: dashed; border-color: var(--color-border-light); }

	.notes-field {
		width: 100%;
		max-width: 34rem;
		font-family: inherit;
		font-size: var(--text-sm);
		padding: 0.4rem 0.5rem;
		border: 1px solid var(--color-border-input);
		border-radius: var(--radius-md);
		resize: vertical;
	}

	.notes-actions {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-top: 0.3rem;
	}

	.notes-hint { font-size: var(--text-xs); color: var(--color-text-muted); }
	.notes-error { margin: 0.3rem 0 0; font-size: var(--text-xs); color: var(--color-error); }

	/* Prise audio + vidéo : un seul lecteur à l'écran à la fois */
	.view-tabs { display: flex; gap: 0.35rem; margin-bottom: 0.8rem; }

	.view-tab {
		background: none;
		border: 1px solid var(--color-border-light);
		border-radius: 999px;
		padding: 0.25rem 0.8rem;
		font: inherit;
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		cursor: pointer;
	}

	.view-tab.active {
		border-color: var(--color-accent);
		background: var(--color-accent-light);
		color: var(--color-accent);
		font-weight: 600;
	}

	/* Lecteur */
	.player-card {
		background: var(--color-bg-subtle);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-xl);
		padding: 1rem 1.25rem;
		margin-bottom: 2rem;
	}

	/* Collé en haut de la colonne qui défile (`.app-content` sur ordinateur, la page
	   elle-même sous la barre du haut sur mobile). */
	.player-card.sticky {
		position: sticky;
		top: 0;
		z-index: 5;
	}

	/* ─── Responsive ───────────────────── */
	@media (max-width: 640px) {
		main { margin: 1rem auto; padding: 0 0.75rem; }

		.header {
			flex-direction: column;
			align-items: stretch;
			gap: 0.75rem;
		}

		.header-actions { justify-content: flex-start; }
		.header-actions > * { flex: 1 1 auto; }

		h1 { font-size: 1.2rem; flex-wrap: wrap; }

		.player-card { padding: 0.85rem 0.8rem; }

		/* La barre du haut y est elle-même collée : on se pose dessous, pas dessus. */
		.player-card.sticky { top: 44px; }
	}
</style>
