<script lang="ts">
	import type { PageData } from './$types'
	import { onMount, tick, untrack } from 'svelte'
	import { page } from '$app/state'
	import { afterNavigate, invalidateAll } from '$app/navigation'
	import { player } from '$lib/player.svelte'
	import { formatDateOnly } from '$lib/date'
	import AudioPlayer from '$lib/components/AudioPlayer.svelte'
	import CommentsPanel from '$lib/components/CommentsPanel.svelte'
	import SongDetails from '$lib/components/SongDetails.svelte'
	import AddToPlaylistButton from '$lib/components/AddToPlaylistButton.svelte'
	import YouTubePlayer from '$lib/components/YouTubePlayer.svelte'
	import { youtubeWatchUrl, parseTimecode } from '$lib/youtube'
	import type { CommentWithReactions } from '$lib/types'
	import Icon from '$lib/components/Icon.svelte'
	import SongSelect from '$lib/components/SongSelect.svelte'
	import ShareLinkDialog from '$lib/components/ShareLinkDialog.svelte'
	import ShareMenu from '$lib/components/ShareMenu.svelte'
	import { canSharePublicly } from '$lib/types'
	import { isPlaceholderSongTitle, sortedWithSong } from '$lib/songs'
	import AudioEnhanceDialog from '$lib/components/AudioEnhanceDialog.svelte'
	import type { EnhanceState } from '$lib/audio-enhance'

	let { data }: { data: PageData } = $props()

	type Recording = {
		id: number; take: number; status: string; notes: string | null
		duration_s: number | null; uploaded_by: string; session_id: number; song_id: number
		file_path: string | null; source_file_name: string | null; enhanced_at: string | null
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
	const sharedTrackMatches = $derived(player.track?.recordingId === recording.id)

	function sharedRecordingTrack(r: Recording) {
		return {
			recordingId: r.id,
			songId: r.song_id,
			songTitle: r.song_title,
			take: r.take,
			sessionDate: String(r.session_date),
			durationS: r.duration_s
		}
	}

	// Une navigation vers un commentaire ne remplace jamais la prise déjà chargée. Si le
	// lecteur est libre, cette page peut l'initialiser sans lancer la lecture.
	$effect(() => {
		const r = recording
		if (!r.file_path) return
		untrack(() => {
			if (!player.track) player.load(sharedRecordingTrack(r))
		})
	})

	// La waveform ne masque la barre du bas que lorsqu'elle pilote la même prise.
	$effect(() => {
		if (!hasAudio || !sharedTrackMatches) return
		player.attachView()
		return () => player.detachView()
	})

	function playThisRecording(at: number) {
		player.load(sharedRecordingTrack(recording), true)
		if (at > 0) player.seek(at)
	}

	// Un seul lecteur actif à l'écran. Revenir à l'audio n'a rien à arrêter : le lecteur
	// vidéo est retiré de la page, et détruit avec lui.
	function selectView(next: 'audio' | 'video') {
		if (next === 'video' && sharedTrackMatches) player.pause()
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

	// --- Amélioration du son ---
	//
	// Proposée là où l'on arrive juste après un envoi ou un enregistrement. La mesure
	// coûte quelques secondes à la première visite (gardée ensuite) : elle se charge
	// après la page, sans la retenir, et rien ne s'affiche tant qu'elle n'a rien à dire.
	let enhance = $state<EnhanceState | null>(null)
	let enhanceFailed = $state(false)
	let enhanceOpen = $state(false)
	// Remonte le lecteur quand le fichier de la prise change : nouvelle forme d'onde.
	let audioGeneration = $state(0)
	const firstEnhanceIssue = $derived(enhance?.diagnosis?.issues.find((issue) => issue.fixable) ?? null)
	// Que la prise soit améliorée, la page le sait dès son chargement : seule la fenêtre,
	// ou un retour à l'original, en dit plus.
	const isEnhanced = $derived(enhance ? !!enhance.enhanced : !!recording.enhanced_at)

	// Suivi par l'id seul : `recording` est recréé à chaque `invalidateAll`, et refermer
	// la fenêtre juste après « Garder la version améliorée » ne doit pas en découler.
	const recordingId = $derived(recording.id)
	$effect(() => {
		const id = recordingId
		const audio = hasAudio
		enhance = null
		enhanceFailed = false
		enhanceOpen = false
		// La mesure décode tout le fichier la première fois. Une prise déjà améliorée n'a
		// rien à suggérer : c'est la fenêtre « Comparer » qui la demandera, si on l'ouvre.
		if (!audio || untrack(() => recording.enhanced_at)) return
		const controller = new AbortController()
		fetch(`/api/recordings/${id}/enhance`, { signal: controller.signal })
			.then((res) => (res.ok ? (res.json() as Promise<EnhanceState>) : null))
			.then((state) => {
				if (state) enhance = state
				else enhanceFailed = true
			})
			.catch((err: unknown) => {
				if ((err as { name?: string }).name !== 'AbortError') enhanceFailed = true
			})
		return () => controller.abort()
	})

	async function onEnhanceChange(state: EnhanceState) {
		enhance = state
		player.reload(recording.id)
		// La forme d'onde vient du chargement de la page, recalculée sur le nouveau fichier.
		await invalidateAll()
		audioGeneration += 1
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

		if (location.hash !== '#notes') return
		notesBlock?.scrollIntoView({ block: 'center' })
		startEditNotes()
	})

	// À chaque navigation, pas seulement au montage : une notification de commentaire
	// cliquée sur la prise déjà ouverte y revient avec une autre ancre.
	afterNavigate(() => {
		const targeted = location.hash.match(/^#comment-(\d+)$/)
		if (!targeted) return
		highlightToken += 1
		highlightRequest = { id: Number(targeted[1]), token: highlightToken }
	})

	// Copier le lien plutôt que d'aller le chercher dans la barre d'adresse : sur
	// téléphone, c'est la manœuvre qui décourage de partager. Le repère suit le
	// lecteur : partager depuis 1:23 partage 1:23.
	const shareTime = $derived(
		playerState.currentTime > 1 ? Math.floor(playerState.currentTime) : null
	)

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

	// Repère du commentaire en cours d'écriture, montré sur le lecteur avant l'envoi.
	let draftAnchor = $state<number | null>(null)

	const commentMarkers = $derived([
		...comments
			.filter((comment) => comment.timestamp_s !== null && comment.timestamp_s !== undefined)
			.map((comment) => ({
				id: comment.id,
				time: comment.timestamp_s as number,
				label: `${formatTime(comment.timestamp_s as number)} — ${comment.author}`
			})),
		...(draftAnchor !== null
			? [{ id: 'draft', time: draftAnchor, label: `Ton commentaire, à ${formatTime(draftAnchor)}`, draft: true }]
			: [])
	])
</script>

<svelte:head>
	<title>{recording.song_title} — Prise {recording.take}</title>
</svelte:head>

<svelte:window bind:innerHeight />

<main class="page" style="--comment-scroll-margin: {stickyPlayer ? playerHeight + 24 : 16}px">
	<!-- Fil d'Ariane -->
	<nav class="breadcrumb">
		<a href="/sessions">Sessions</a> /
		<a href="/sessions/{recording.session_id}">{formatDate(recording.session_date)}</a> /
		<span>{recording.song_title} · Prise {recording.take}</span>
	</nav>

	<!-- En-tête -->
	<div class="header">
		<div class="header-main">
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
							{renaming ? 'Renommage…' : 'Renommer'}
						</button>
					</form>
					{#if renameClash}
						<p class="song-fix-hint">
							« {renameClash.title} » existe déjà.
							<button class="btn-link" onclick={() => moveTo(String(renameClash!.id))} disabled={moving}>
								Rattacher la prise à ce morceau
							</button>
						</p>
					{/if}
					{#if renameError}<p class="notes-error">{renameError}</p>{/if}
					{#if !moveOpen}
						<button class="btn-link" onclick={() => (moveOpen = true)}>
							C'est un morceau déjà au référentiel ?
						</button>
					{/if}
				</div>
			{:else if !moveOpen}
				<button class="btn-link change-song" onclick={() => (moveOpen = true)}>Changer de morceau</button>
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
							{notesSaving ? 'Sauvegarde…' : 'Valider'}
						</button>
						<button class="btn btn-ghost btn-sm" onclick={cancelEditNotes} disabled={notesSaving}>Annuler</button>
						<span class="notes-hint">Ctrl/⌘+Entrée pour valider</span>
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
			{#if prevRecording}
				<a href="/recording/{prevRecording.id}" class="btn btn-secondary btn-sm" title="Prise précédente">← Prise {prevRecording.take}</a>
			{/if}
			{#if nextRecording}
				<a href="/recording/{nextRecording.id}" class="btn btn-secondary btn-sm" title="Prise suivante">Prise {nextRecording.take} →</a>
			{/if}
			<ShareMenu
				class="share-menu-slot"
				recordingId={recording.id}
				time={shareTime}
				downloadUrl={hasAudio ? `/audio/${recording.id}.mp3?download` : null}
				canSharePublic={canShare}
				{shareCount}
				label="Partager"
				onOpenPublic={() => (shareOpen = true)}
			/>
			{#if hasAudio}
				<AddToPlaylistButton
					recordingId={recording.id}
					{hasAudio}
					label="Ajouter à une playlist"
					buttonClass="btn btn-secondary btn-sm btn-collapse"
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
			{#key `${sharedTrackMatches}-${audioGeneration}`}
				<AudioPlayer
					track={playerTrack}
					media={sharedTrackMatches ? player.media : null}
					markers={commentMarkers}
					seekRequest={seekRequest}
					onPlayRequest={sharedTrackMatches ? null : playThisRecording}
					onStateChange={(state) => {
						playerState = state
					}}
					onMarkerSelect={(markerId) => {
						highlightToken += 1
						highlightRequest = { id: Number(markerId), token: highlightToken }
					}}
				/>
			{/key}
		{/if}
	</div>

	{#if hasAudio && isEnhanced}
		<p class="enhance-line">
			<Icon name="sliders" size="0.85rem" /> Son amélioré
			<button class="btn-link" onclick={() => (enhanceOpen = true)}>Comparer avec l'original</button>
		</p>
	{:else if hasAudio && enhanceFailed}
		<p class="enhance-line">
			<Icon name="sliders" size="0.85rem" /> Amélioration du son indisponible : l'analyse a échoué.
		</p>
	{:else if hasAudio && enhance}
		{#if enhance.diagnosis?.recommended && firstEnhanceIssue}
			<div class="enhance-suggest">
				<p><Icon name="sliders" size="0.9rem" /> {firstEnhanceIssue.label}.</p>
				<button class="btn btn-secondary btn-sm" onclick={() => (enhanceOpen = true)}>Améliorer le son</button>
			</div>
		{:else if enhance.diagnosis?.enhanceable}
			<p class="enhance-line">
				<button class="btn-link-muted" onclick={() => (enhanceOpen = true)}>
					<Icon name="sliders" size="0.85rem" /> Améliorer le son
				</button>
			</p>
		{:else if !enhance.analysis}
			<!-- Se taire ici cacherait que l'outil existe, et qu'il y a un problème de fichier. -->
			<p class="enhance-line">
				<Icon name="sliders" size="0.85rem" /> Amélioration du son indisponible : le fichier audio n'a pas pu être lu.
			</p>
		{/if}
	{/if}

	<CommentsPanel
		thread={{ kind: 'recording', id: recording.id }}
		comments={comments}
		members={groupMembers}
		currentTime={playerState.currentTime}
		playerReady={playerState.ready}
		highlightRequest={highlightRequest}
		onSeek={seekTo}
		onDraftAnchorChange={(seconds) => (draftAnchor = seconds)}
		onCommentsChange={(updatedComments) => {
			comments = updatedComments
		}}
	/>

	{#if enhanceOpen}
		<AudioEnhanceDialog
			recordingId={recording.id}
			initial={enhance}
			onClose={() => (enhanceOpen = false)}
			onChange={onEnhanceChange}
		/>
	{/if}

	{#if shareOpen}
		<ShareLinkDialog
			target={{ kind: 'recording', id: recording.id }}
			onClose={() => (shareOpen = false)}
			onCountChange={(count) => (shareCount = count)}
		/>
	{/if}
</main>

<style>
	.header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 1.25rem; }
	/* Le titre garde sa largeur : ce sont les boutons qui passent à la ligne, pas le nom
	   du morceau qui se replie mot par mot. */
	.header-main { flex: 1 0 14rem; min-width: 0; }
	.header-actions { display: flex; align-items: center; gap: 0.5rem; flex: 0 1 auto; min-width: 0; flex-wrap: wrap; justify-content: flex-end; }

	/* La colonne de contenu vaut la fenêtre moins les 188 px de la barre latérale : sous
	   ~860 px, titre et boutons ne tiennent plus côte à côte, les boutons passent dessous. */
	@media (max-width: 860px) {
		.header { flex-direction: column; align-items: stretch; gap: 0.75rem; }
		.header-main { flex: none; }
		.header-actions { justify-content: flex-start; }
	}

	h1 {
		font-size: var(--text-xl);
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
		font-size: var(--text-sm);
		font-weight: 400;
		background: var(--color-chip-bg);
		color: var(--color-text-secondary);
		padding: 0.15rem 0.45rem;
		border-radius: var(--radius-sm);
	}

	.meta { font-size: var(--text-sm); color: var(--color-text-secondary); }

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

	/* Les actions de correction du morceau restent à la taille des métadonnées. */
	.btn-link { font-size: var(--text-xs); }

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

	/* Sous le lecteur, hors de la partie collée : une proposition, pas une commande. */
	.enhance-line {
		display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap;
		margin: -1.25rem 0 2rem; font-size: var(--text-sm); color: var(--color-text-muted);
	}
	.enhance-line .btn-link-muted { display: inline-flex; align-items: center; gap: 0.35rem; }
	.enhance-suggest {
		display: flex; align-items: center; justify-content: space-between; gap: 0.5rem 1rem; flex-wrap: wrap;
		margin: -1.25rem 0 2rem; padding: 0.55rem 0.8rem;
		background: var(--color-warning-bg); border: 1px solid var(--color-warning-border);
		border-radius: var(--radius-lg); color: var(--color-warning-text); font-size: var(--text-sm);
	}
	.enhance-suggest p { margin: 0; display: flex; align-items: center; gap: 0.4rem; }

	.notes-hint { font-size: var(--text-xs); color: var(--color-text-muted); }
	.notes-error { margin: 0.3rem 0 0; font-size: var(--text-xs); color: var(--color-error); }

	/* Prise audio + vidéo : un seul lecteur à l'écran à la fois */
	.view-tabs { display: flex; gap: 0.35rem; margin-bottom: 0.8rem; }

	.view-tab {
		background: none;
		border: 1px solid var(--color-border-light);
		border-radius: var(--radius-pill);
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
		border: 1px solid var(--color-border-light);
		border-radius: var(--radius-xl);
		padding: 1rem 1.25rem;
		margin-bottom: 2rem;
	}

	/* Collé sous la barre du haut, elle-même collée en haut de la fenêtre. */
	.player-card.sticky {
		position: sticky;
		top: var(--top-bar-h);
		z-index: 5;
	}

	/* ─── Responsive ───────────────────── */
	@media (max-width: 640px) {

		.header-actions > * { flex: 1 1 auto; }
		/* Réduits à leur icône ou à un mot, ils ne s'étirent pas : ce sont les boutons de
		   navigation qui prennent la place restante. */
		.header-actions > :global(.btn-collapse),
		.header-actions > :global(.share-menu-slot) { flex: 0 0 auto; }
		.header-actions > :global(.share-menu-slot .btn) { min-height: 2.5rem; }

		h1 { font-size: var(--text-lg); flex-wrap: wrap; }

		.player-card { padding: 0.85rem 0.8rem; }
	}
</style>
