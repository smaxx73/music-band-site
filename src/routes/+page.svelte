<script lang="ts">
	import type { PageData } from './$types'
	import { onMount } from 'svelte'
	import { invalidateAll } from '$app/navigation'
	import { formatDateOnly, localDateOnly, nearDayLabel, relativeDayLabel, toDateOnly } from '$lib/date'
	import PublicLanding from '$lib/components/PublicLanding.svelte'
	import Icon from '$lib/components/Icon.svelte'
	import SessionCover from '$lib/components/SessionCover.svelte'
	import PlayAllButton from '$lib/components/PlayAllButton.svelte'
	import type { IconName } from '$lib/icons'
	import type { PlayerTrack } from '$lib/player.svelte'
	import { findPendingTake } from '$lib/recording-store'
	import {
		formatDurationLong,
		postKindLabel,
		postTitle,
		sessionTypeLabel,
		type PostView,
		type SessionType,
	} from '$lib/types'

	let { data }: { data: PageData } = $props()

	type LastSession = { id: number; date: string; type: SessionType; title: string | null; location: string | null }
	type LastTrack = {
		id: number; take: number; duration_s: number | null; song_id: number; song_title: string; comment_count: number
	}
	type UpcomingItem = {
		kind: 'session' | 'event'; id: number; date: string; type: string
		title: string | null; location: string | null; absents: string[]
	}
	type Unavailability = { id: number; date: string; author: string }
	type PlaylistRow = { id: number; name: string; item_count: number; updated_at: string | null; created_at: string }
	type SetlistRow = { id: number; name: string; created_at: string; created_by: string; item_count: number }
	type RecentSession = { id: number; date: string; title: string | null; location: string | null; created_at: string }
	type RecentRecordings = {
		session_id: number; session_date: string; session_title: string | null; author: string
		recording_count: number; created_at: string; song_titles: string[]
	}
	// Un commentaire porte sur une prise, une setlist OU une publication : une seule paire est remplie.
	type RecentComment = {
		id: number; author: string; content: string; created_at: string; timestamp_s: number | null
		recording_id: number | null; song_title: string | null
		setlist_id: number | null; setlist_name: string | null
		post_id: number | null; post_title: string | null
	}

	const lastSession = $derived((data.lastSession ?? null) as LastSession | null)
	const lastTracks = $derived((data.lastTracks ?? []) as unknown as LastTrack[])
	const upcomingItems = $derived((data.upcomingItems ?? []) as unknown as UpcomingItem[])
	const otherUnavailabilities = $derived((data.otherUnavailabilities ?? []) as unknown as Unavailability[])
	const playlists = $derived((data.playlists ?? []) as unknown as PlaylistRow[])
	const setlists = $derived((data.setlists ?? []) as unknown as SetlistRow[])
	const posts = $derived((data.posts ?? []) as unknown as PostView[])
	const recentComments = $derived((data.recentComments ?? []) as unknown as RecentComment[])
	const recentSessions = $derived((data.recentSessions ?? []) as unknown as RecentSession[])
	const recentRecordings = $derived((data.recentRecordings ?? []) as unknown as RecentRecordings[])
	const placeholderSongCount = $derived(data.placeholderSongCount ?? 0)
	const pendingImportCount = $derived(data.pendingImportCount ?? 0)
	const hasGroup = $derived(!!data.user?.current_group_id)

	// Un enregistrement resté dans la copie de secours n'existe que dans ce navigateur :
	// c'est le seul « à toi » que le serveur ne peut pas connaître.
	let pendingTake = $state(false)

	// Le tableau de bord reste à jour lorsqu’on le laisse ouvert ou qu’on y revient.
	onMount(() => {
		try {
			if (localStorage.getItem(ACTIVITY_VIEW_KEY) === 'comments') activityView = 'comments'
		} catch { /* Stockage refusé : la vue par défaut suffit. */ }

		findPendingTake()
			.then((take) => { pendingTake = take !== null })
			.catch(() => { /* Pas de stockage local (navigation privée) : rien à reprendre. */ })

		let refreshing = false
		async function refresh() {
			if (!data.user || document.visibilityState !== 'visible' || refreshing) return
			refreshing = true
			try { await invalidateAll() }
			catch { /* Hors ligne : garder les dernières données, puis réessayer. */ }
			finally { refreshing = false }
		}
		const timer = setInterval(refresh, 60_000)
		window.addEventListener('focus', refresh)
		document.addEventListener('visibilitychange', refresh)
		return () => {
			clearInterval(timer)
			window.removeEventListener('focus', refresh)
			document.removeEventListener('visibilitychange', refresh)
		}
	})

	const firstName = $derived(data.user?.display_name?.split(' ')[0] ?? 'vous')

	function formatDate(d: string | Date) {
		return formatDateOnly(d, { weekday: 'short', day: 'numeric', month: 'short' })
	}

	function formatShortDate(d: string | Date) {
		return new Date(toDateOnly(d) || d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
	}

	// Aujourd'hui, demain, hier : dits en toutes lettres partout sur la page.
	function dayLabel(d: string, format: (d: string) => string) {
		return nearDayLabel(d) ?? format(d)
	}

	// Un horodatage de création se lit au jour de l'appareil, pas à celui de Greenwich :
	// une prise déposée à 23 h reste « aujourd'hui ».
	function activityDate(at: string | Date) {
		const day = localDateOnly(new Date(at))
		return nearDayLabel(day) ?? formatShortDate(day)
	}

	function plural(n: number, one: string, many = `${one}s`) {
		return `${n} ${n > 1 ? many : one}`
	}

	// ─── À réécouter : la dernière session, morceau par morceau ───

	// Même ordre que la page de la session (titre, puis numéro de prise) : le ▶ enchaîne
	// ce que la liste montre.
	const lastTrackList = $derived<PlayerTrack[]>(
		lastSession
			? lastTracks.map((t) => ({
				recordingId: t.id,
				songId: t.song_id,
				songTitle: t.song_title,
				take: t.take,
				sessionDate: lastSession.date,
				durationS: t.duration_s,
			}))
			: []
	)

	type SongSummary = { id: number; title: string; takes: number; comments: number }
	const lastSongs = $derived.by(() => {
		const songs = new Map<number, SongSummary>()
		for (const t of lastTracks) {
			const song = songs.get(t.song_id) ?? { id: t.song_id, title: t.song_title, takes: 0, comments: 0 }
			song.takes += 1
			song.comments += t.comment_count
			songs.set(t.song_id, song)
		}
		return [...songs.values()]
	})
	const SONGS_SHOWN = 6

	const lastStats = $derived.by(() => {
		const duration = lastTracks.reduce((n, t) => n + (t.duration_s ?? 0), 0)
		return [
			plural(lastSongs.length, 'morceau', 'morceaux'),
			plural(lastTracks.length, 'prise'),
			duration > 0 ? formatDurationLong(duration) : null,
		].filter(Boolean).join(' · ')
	})

	// ─── À venir ───

	// Ouvre l'agenda sur le jour de l'événement, panneau du jour déplié.
	function agendaDayUrl(d: string | Date) {
		return `/agenda?date=${toDateOnly(d)}`
	}

	function upcomingHref(item: UpcomingItem) {
		return item.kind === 'session' ? `/sessions/${item.id}` : agendaDayUrl(item.date)
	}

	function sessionCreateUrl(item: UpcomingItem) {
		const params = new URLSearchParams({
			link_event_id: String(item.id),
			date: toDateOnly(item.date),
			type: item.type,
		})
		if (item.title) params.set('title', item.title)
		if (item.location) params.set('location', item.location)
		return `/sessions?${params.toString()}`
	}

	const nextItem = $derived(upcomingItems[0] ?? null)
	const laterItems = $derived(upcomingItems.slice(1))

	// ─── À toi : ce qui attend l'utilisateur lui-même ───

	type Todo = { href: string; icon: IconName; label: string }
	const todos = $derived.by(() => {
		const list: Todo[] = []
		if (pendingTake) list.push({ href: '/record', icon: 'mic', label: 'Un enregistrement n’a pas été envoyé' })
		if (pendingImportCount > 0) {
			list.push({
				href: hasGroup ? '/upload' : '/perso',
				icon: 'scissors',
				label: pendingImportCount > 1 ? `${pendingImportCount} découpes en attente` : 'Une découpe en attente',
			})
		}
		if (placeholderSongCount > 0) {
			list.push({
				href: '/songs?filtre=a_nommer',
				icon: 'music',
				label: placeholderSongCount > 1 ? `${placeholderSongCount} morceaux à nommer` : 'Un morceau à nommer',
			})
		}
		return list
	})

	// ─── Activité : un aperçu, le fil montre le reste ───

	function truncate(text: string, max = 70) {
		const clean = text.replace(/\s+/g, ' ').trim()
		return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
	}

	// L’activité utilise les dates de création/dépôt, indépendamment du calendrier.
	type ActivityKind = 'session' | 'recordings' | 'playlist' | 'setlist' | 'post' | 'comment'
	type ActivityItem = {
		kind: ActivityKind; ts: number; date: string; label: string; detail: string
		color: string; href: string
	}
	const ACTIVITY_ICON: Record<ActivityKind, IconName> = {
		session: 'calendar',
		recordings: 'music',
		playlist: 'playlist',
		setlist: 'list',
		post: 'send',
		comment: 'comment'
	}
	const ACTIVITY_SHOWN = 3

	// Deux vues séparées, à la même place plutôt qu'une section de plus : les nouveautés
	// (ce qui a été créé ou déposé) et les commentaires. Mêlés, les commentaires sortaient
	// des trois lignes dès qu'une répétition était déposée. Le choix suit le membre d'une
	// visite à l'autre.
	const ACTIVITY_VIEW_KEY = 'dashboard-activity-view'
	type ActivityView = 'news' | 'comments'
	let activityView = $state<ActivityView>('news')

	function setActivityView(view: ActivityView) {
		activityView = view
		try { localStorage.setItem(ACTIVITY_VIEW_KEY, view) }
		catch { /* Stockage refusé : le choix vaut pour cette visite. */ }
	}

	// Le commentaire mène là où il a été écrit — la prise, la setlist ou la publication —,
	// et sur le commentaire lui-même, au repère de la prise s'il en a un.
	function commentItem(c: RecentComment): ActivityItem {
		const target = c.setlist_id !== null
			? { name: c.setlist_name, path: `/setlists/${c.setlist_id}` }
			: c.post_id !== null
				? { name: c.post_title, path: `/posts/${c.post_id}` }
				: { name: c.song_title, path: `/recording/${c.recording_id}` }
		const t = c.timestamp_s !== null ? `?t=${Math.floor(c.timestamp_s)}` : ''
		return {
			kind: 'comment',
			ts: new Date(c.created_at).getTime(),
			date: activityDate(c.created_at),
			label: `${c.author} — ${target.name}`,
			detail: truncate(c.content),
			color: 'var(--color-green)',
			href: `${target.path}${t}#comment-${c.id}`,
		}
	}

	const news = $derived.by((): ActivityItem[] => {
		const items: ActivityItem[] = []

		for (const s of recentSessions) {
			items.push({
				kind: 'session',
				ts: new Date(s.created_at).getTime(),
				date: activityDate(s.created_at),
				label: 'Session créée',
				detail: [s.title, dayLabel(s.date, formatShortDate), s.location].filter(Boolean).join(' · '),
				color: 'var(--color-accent)',
				href: `/sessions/${s.id}`,
			})
		}

		for (const batch of recentRecordings) {
			items.push({
				kind: 'recordings',
				ts: new Date(batch.created_at).getTime(),
				date: activityDate(batch.created_at),
				label: `${batch.recording_count} prise${batch.recording_count > 1 ? 's ajoutées' : ' ajoutée'} — ${batch.author}`,
				detail: [batch.session_title ?? dayLabel(batch.session_date, formatShortDate), batch.song_titles.slice(0, 2).join(', ')].filter(Boolean).join(' · '),
				color: 'var(--color-accent)',
				href: `/sessions/${batch.session_id}`,
			})
		}

		for (const p of playlists) {
			const at = p.updated_at ?? p.created_at
			if (at) {
				items.push({
					kind: 'playlist',
					ts: new Date(at).getTime(),
					date: activityDate(at),
					label: p.updated_at && new Date(p.updated_at).getTime() !== new Date(p.created_at).getTime() ? 'Playlist modifiée' : 'Playlist créée',
					detail: p.name,
					color: 'var(--color-blue)',
					href: `/playlists/${p.id}`,
				})
			}
		}

		// Une setlist créée annonce ce que le groupe prépare : elle a sa place ici, au
		// même titre qu'une session. Sa modification, elle, ne dit rien de plus.
		for (const sl of setlists) {
			items.push({
				kind: 'setlist',
				ts: new Date(sl.created_at).getTime(),
				date: activityDate(sl.created_at),
				label: `Setlist créée — ${sl.created_by}`,
				detail: sl.name,
				color: 'var(--color-mid)',
				href: `/setlists/${sl.id}`,
			})
		}

		// Ce qu'un membre apporte depuis son espace : un enregistrement, une vidéo, une idée.
		for (const p of posts) {
			items.push({
				kind: 'post',
				ts: new Date(p.created_at).getTime(),
				date: activityDate(p.created_at),
				label: `${postKindLabel(p)} — ${p.author}`,
				detail: p.message ? `${postTitle(p)} · ${truncate(p.message, 50)}` : postTitle(p),
				color: 'var(--color-purple)',
				href: `/posts/${p.id}`,
			})
		}

		// Tri sur l'horodatage brut : les libellés de date sont déjà formatés pour l'affichage.
		items.sort((a, b) => b.ts - a.ts)
		return items.slice(0, ACTIVITY_SHOWN)
	})

	const shownActivity = $derived(activityView === 'comments' ? recentComments.map(commentItem) : news)
</script>

<svelte:head>
	<title>{data.user ? 'Tableau de bord' : 'BandStash'}</title>
</svelte:head>

{#if !data.user}
	<PublicLanding />
{:else}

<main>
	<!-- Pas de boutons ici : créer passe par « + Ajouter » de la navigation. -->
	<h1 class="dash-title">Bonjour {firstName} 👋</h1>

	<div class="dash-layout">
		<div class="dash-main">
			{#if hasGroup}
				<!-- En premier : on ouvre l'application d'abord pour réécouter la dernière
				     répétition, et le ▶ y suffit sans passer par la page de la session. -->
				<section aria-labelledby="dash-replay">
					<div class="section-header">
						<h2 id="dash-replay">À réécouter</h2>
						<a href="/sessions" class="link-more">Toutes les sessions →</a>
					</div>
					{#if lastSession}
						<div class="replay">
							<div class="replay-head">
								<a href="/sessions/{lastSession.id}" class="replay-cover" tabindex="-1" aria-hidden="true">
									<SessionCover date={lastSession.date} type={lastSession.type} />
								</a>
								<div class="replay-text">
									<span class="replay-kicker">
										{sessionTypeLabel(lastSession.type)} · {relativeDayLabel(lastSession.date)}
									</span>
									<a href="/sessions/{lastSession.id}" class="replay-title">
										{lastSession.title ?? `${sessionTypeLabel(lastSession.type)} du ${formatDate(lastSession.date)}`}
									</a>
									<span class="replay-stats">
										{lastStats}{#if lastSession.location} · {lastSession.location}{/if}
									</span>
								</div>
								<div class="replay-play">
									<PlayAllButton tracks={lastTrackList} label="Écouter toute la session à la suite" />
								</div>
							</div>
							<ul class="replay-songs">
								{#each lastSongs.slice(0, SONGS_SHOWN) as song (song.id)}
									<li>
										<a href="/sessions/{lastSession.id}#song-{song.id}" class="replay-song">
											<span class="replay-song-title">{song.title}</span>
											<span class="replay-song-meta">
												{plural(song.takes, 'prise')}
												{#if song.comments > 0}
													<span class="replay-song-comments" title={plural(song.comments, 'commentaire')}>
														<Icon name="comment" size="0.8rem" /> {song.comments}
													</span>
												{/if}
											</span>
										</a>
									</li>
								{/each}
							</ul>
							{#if lastSongs.length > SONGS_SHOWN}
								<a href="/sessions/{lastSession.id}" class="link-more replay-more">
									et {plural(lastSongs.length - SONGS_SHOWN, 'autre morceau', 'autres morceaux')} →
								</a>
							{/if}
						</div>
					{:else}
						<div class="empty-row">
							<p class="empty">Aucune prise à réécouter pour l'instant.</p>
							<a href="/record" class="btn btn-secondary btn-sm">
								<Icon name="mic" /> Enregistrer
							</a>
						</div>
					{/if}
				</section>

				<!-- Toujours affichée, même vide : c'est l'entrée vers l'agenda, et « rien de
				     prévu » est aussi une information. -->
				<section aria-labelledby="dash-upcoming">
					<div class="section-header">
						<h2 id="dash-upcoming">À venir</h2>
						<a href="/agenda" class="link-more">Agenda →</a>
					</div>
					{#if nextItem}
						<!-- La prochaine date en entier ; les absents sur sa carte, c'est là qu'ils
						     comptent. Un événement d'agenda sans session se distingue en pointillé. -->
						<div class="next session-type-{nextItem.type}" class:next-event={nextItem.kind === 'event'}>
							<a href={upcomingHref(nextItem)} class="next-link">
								<span class="next-when">{relativeDayLabel(nextItem.date)}</span>
								<span class="next-title">
									{nextItem.title ?? sessionTypeLabel(nextItem.type)}
								</span>
								<span class="next-detail">
									<span class="next-date">{formatDate(nextItem.date)}</span>
									{#if nextItem.title}· {sessionTypeLabel(nextItem.type)}{/if}
									{#if nextItem.location}· {nextItem.location}{/if}
								</span>
								{#if nextItem.absents.length > 0}
									<span class="absents">
										<span class="absents-label">Absent{nextItem.absents.length > 1 ? 's' : ''}</span>
										{nextItem.absents.join(', ')}
									</span>
								{/if}
							</a>
							{#if nextItem.kind === 'event'}
								<a href={sessionCreateUrl(nextItem)} class="event-create-btn">Créer la session →</a>
							{/if}
						</div>
						{#if laterItems.length > 0}
							<ul class="later">
								{#each laterItems as item (`${item.kind}-${item.id}`)}
									<li>
										<a href={upcomingHref(item)} class="later-row">
											<span class="later-date">{dayLabel(item.date, formatDate)}</span>
											<span class="later-title">
												{item.title ?? sessionTypeLabel(item.type)}{#if item.location}<span class="later-loc"> · {item.location}</span>{/if}
											</span>
											{#if item.absents.length > 0}
												<span class="later-absents" title="Absents : {item.absents.join(', ')}">
													{plural(item.absents.length, 'absent')}
												</span>
											{/if}
										</a>
									</li>
								{/each}
							</ul>
						{/if}
					{:else}
						<!-- « Agenda → » mène déjà au calendrier : ce lien-ci ouvre le jour même,
						     formulaire d'ajout déplié, pour être une action et pas un second chemin. -->
						<div class="empty-row">
							<p class="empty">Rien de prévu.</p>
							<a href="/agenda?date={localDateOnly()}" class="btn btn-secondary btn-sm">
								<Icon name="plus" /> Ajouter une date
							</a>
						</div>
					{/if}
					{#if otherUnavailabilities.length > 0}
						<p class="unavail-line">
							<span class="unavail-label">Indisponibles</span>
							{#each otherUnavailabilities as u, i}
								<a href={agendaDayUrl(u.date)}>{u.author} ({nearDayLabel(u.date)?.toLowerCase() ?? formatShortDate(u.date)})</a>{i < otherUnavailabilities.length - 1 ? ', ' : ''}
							{/each}
						</p>
					{/if}
				</section>
			{/if}
		</div>

		<div class="dash-side">
			<!-- N'apparaît que s'il y a quelque chose : une section vide dirait « tout va
			     bien » en prenant la place de ce qui compte. -->
			{#if todos.length > 0}
				<section aria-labelledby="dash-todo">
					<div class="section-header">
						<h2 id="dash-todo">À toi</h2>
					</div>
					<ul class="todos">
						{#each todos as todo (todo.href)}
							<li>
								<a href={todo.href} class="todo">
									<Icon name={todo.icon} size="1rem" />
									<span>{todo.label}</span>
									<Icon name="chevron-right" size="0.9rem" class="todo-chevron" />
								</a>
							</li>
						{/each}
					</ul>
				</section>
			{/if}

			{#if hasGroup}
				<section aria-labelledby="dash-activity">
					<div class="section-header">
						<h2 id="dash-activity">Activité récente</h2>
						<a href="/fil" class="link-more">Tout le fil →</a>
					</div>
					<div class="activity-toggle" role="group" aria-label="Activité à afficher">
						<button
							type="button"
							aria-pressed={activityView === 'news'}
							onclick={() => setActivityView('news')}
						>Nouveautés</button>
						<button
							type="button"
							aria-pressed={activityView === 'comments'}
							onclick={() => setActivityView('comments')}
						><Icon name="comment" size="0.8rem" /> Commentaires</button>
					</div>
					{#if shownActivity.length === 0}
						<p class="empty">{activityView === 'comments' ? 'Aucun commentaire.' : 'Aucune nouveauté.'}</p>
					{:else}
						<ul class="timeline">
							{#each shownActivity as item (`${item.kind}-${item.href}-${item.ts}`)}
								<li class="timeline-item">
									<span class="timeline-dot" style="background: {item.color}"></span>
									<a class="timeline-body" href={item.href}>
										<span class="timeline-label">
											<Icon name={ACTIVITY_ICON[item.kind]} size="0.8rem" /> {item.label}
										</span>
										{#if item.detail}
											<span class="timeline-detail">{item.detail}</span>
										{/if}
										<span class="timeline-date">{item.date}</span>
									</a>
								</li>
							{/each}
						</ul>
					{/if}
				</section>

				{#if setlists.length > 0 || playlists.length > 0}
					<section aria-labelledby="dash-prep">
						<div class="section-header">
							<h2 id="dash-prep">En préparation</h2>
						</div>
						<ul class="prep-list">
							{#each setlists as sl (sl.id)}
								<li>
									<a href="/setlists/{sl.id}" class="prep-card">
										<Icon name="list" size="0.95rem" class="prep-icon" />
										<span class="prep-name">{sl.name}</span>
										<span class="prep-meta">{plural(sl.item_count, 'morceau', 'morceaux')}</span>
									</a>
								</li>
							{/each}
							{#each playlists as p (p.id)}
								<li>
									<a href="/playlists/{p.id}" class="prep-card">
										<Icon name="playlist" size="0.95rem" class="prep-icon" />
										<span class="prep-name">{p.name}</span>
										<span class="prep-meta">{plural(p.item_count, 'prise')}</span>
									</a>
								</li>
							{/each}
						</ul>
					</section>
				{/if}
			{/if}
		</div>
	</div>
</main>
{/if}

<style>
	main {
		padding: 1.5rem;
		max-width: 900px;
	}

	.dash-title {
		margin: 0 0 1.25rem;
		font-size: var(--text-xl);
		font-weight: 700;
	}

	.dash-layout {
		display: grid;
		/* minmax(0, 1fr) et non 1fr seul : sans le 0, une piste de grille ne rétrécit
		   jamais sous la largeur min-content de son contenu (un titre, un lieu...),
		   ce qui pousse toute la page plus large que l'écran sur mobile. */
		grid-template-columns: minmax(0, 1fr) 240px;
		gap: 2rem;
		align-items: start;
	}

	section + section { margin-top: 1.75rem; }

	/* ─── Section headers ──────────────── */
	.section-header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.75rem;
		margin-bottom: 0.65rem;
	}

	h2 {
		font-size: var(--text-2xs);
		margin: 0;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
		font-weight: 600;
	}

	.link-more {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		text-decoration: none;
		white-space: nowrap;
	}

	.link-more:hover { color: var(--color-accent); }

	.empty { margin: 0; }

	/* Le constat à gauche, l'action à droite ; l'une passe sous l'autre faute de place. */
	.empty-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem 1rem;
	}

	/* ─── À réécouter ──────────────────── */
	.replay {
		border: 1px solid var(--color-border-light);
		border-radius: var(--radius-xl);
		background: var(--color-bg);
		overflow: hidden;
	}

	.replay-head {
		display: flex;
		align-items: center;
		gap: 0.9rem;
		padding: 0.9rem;
		background: var(--color-paper);
		border-bottom: 1px solid var(--color-border-light);
	}

	/* Le feuillet est dans un lien : sans cela, son texte (mois, jour) hérite du soulignement */
	.replay-cover {
		display: block;
		text-decoration: none;
		width: 64px;
		height: 64px;
		flex-shrink: 0;
		border-radius: var(--radius-lg);
		overflow: hidden;
	}

	.replay-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.replay-kicker {
		font-size: var(--text-2xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
	}

	.replay-title {
		font-size: var(--text-lg);
		font-weight: 700;
		color: var(--color-text);
		text-decoration: none;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.replay-title:hover { color: var(--color-accent-dark); }

	.replay-stats {
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
	}

	.replay-play { flex-shrink: 0; }

	.replay-songs {
		list-style: none;
		margin: 0;
		padding: 0.3rem;
	}

	.replay-song {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.75rem;
		min-height: 40px;
		padding: 0.55rem 0.6rem;
		border-radius: var(--radius-md);
		color: inherit;
		text-decoration: none;
	}

	.replay-song:hover { background: var(--color-bg-subtle); }

	.replay-song-title {
		min-width: 0;
		font-size: var(--text-sm);
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.replay-song-meta {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-shrink: 0;
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		font-variant-numeric: tabular-nums;
	}

	.replay-song-comments {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
		color: var(--color-text-secondary);
	}

	.replay-more {
		display: block;
		padding: 0 0.9rem 0.75rem;
	}

	/* ─── À venir ──────────────────────── */
	/* Teintée comme le type (`.session-type-*`, src/app.css), comme dans l'agenda. */
	.next {
		border: 1px solid transparent;
		border-left: 4px solid var(--type-text, var(--color-accent));
		border-radius: var(--radius-lg);
		background: var(--type-bg, var(--color-accent-light));
		padding: 0.75rem 0.9rem;
	}

	/* Événement d'agenda pas encore transformé en session : pointillé neutre, pour le
	   distinguer d'une session réelle. */
	.next-event {
		background: var(--color-bg);
		border: 1px dashed var(--color-border);
		border-left: 4px solid var(--type-text, var(--color-border));
	}

	.next-link {
		display: flex;
		flex-direction: column;
		gap: 2px;
		color: inherit;
		text-decoration: none;
	}

	.next-link:hover .next-title { color: var(--color-accent-dark); }

	.next-when {
		font-size: var(--text-2xs);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--type-text, var(--color-accent-dark));
	}

	.next-title {
		font-size: var(--text-base);
		font-weight: 700;
		color: var(--color-text);
	}

	.next-detail {
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
	}

	.next-date { text-transform: capitalize; }

	.absents {
		margin-top: 0.35rem;
		font-size: var(--text-xs);
		color: var(--color-text);
	}

	.absents-label,
	.unavail-label {
		font-weight: 700;
		color: var(--color-red-dark);
		margin-right: 0.3rem;
	}

	.event-create-btn {
		display: inline-block;
		margin-top: 0.5rem;
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--color-accent-dark);
		text-decoration: none;
	}

	.event-create-btn:hover { text-decoration: underline; }

	.later {
		list-style: none;
		margin: 0.4rem 0 0;
		padding: 0;
	}

	.later-row {
		display: flex;
		align-items: baseline;
		gap: 0.75rem;
		min-height: 40px;
		padding: 0.5rem 0.4rem;
		border-bottom: 1px solid var(--color-bg-muted);
		color: inherit;
		text-decoration: none;
	}

	.later-row:hover { background: var(--color-bg-subtle); }

	.later-date {
		flex-shrink: 0;
		width: 6.5rem;
		font-size: var(--text-xs);
		font-weight: 600;
		text-transform: capitalize;
		color: var(--color-text-secondary);
	}

	.later-title {
		flex: 1;
		min-width: 0;
		font-size: var(--text-sm);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.later-loc { color: var(--color-text-muted); }

	.later-absents {
		flex-shrink: 0;
		font-size: var(--text-2xs);
		font-weight: 600;
		color: var(--color-red-dark);
	}

	.unavail-line {
		margin: 0.6rem 0 0;
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
	}

	/* Pas de soulignement au repos, comme les autres liens de la page : souligné, un nom
	   se lisait comme une faute de saisie plutôt que comme un lien vers l'agenda. */
	.unavail-line a {
		color: inherit;
		text-decoration: none;
	}

	.unavail-line a:hover { text-decoration: underline; }

	/* ─── À toi ────────────────────────── */
	.todos {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.todo {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		min-height: 40px;
		padding: 0.5rem 0.7rem;
		border: 1px solid var(--color-accent-light);
		border-radius: var(--radius-md);
		background: var(--color-accent-light);
		color: var(--color-text);
		font-size: var(--text-sm);
		font-weight: 600;
		text-decoration: none;
	}

	.todo:hover { border-color: var(--color-accent); }
	.todo > span { flex: 1; min-width: 0; }
	.todo :global(.todo-chevron) { color: var(--color-mid); }

	/* ─── Activité ─────────────────────── */
	.activity-toggle {
		display: inline-flex;
		margin-bottom: 0.75rem;
		border: 1px solid var(--color-border-light);
		border-radius: var(--radius-pill);
		overflow: hidden;
	}

	.activity-toggle button {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		min-height: 28px;
		padding: 0.2rem 0.7rem;
		border: none;
		background: none;
		font: inherit;
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
		cursor: pointer;
	}

	.activity-toggle button:hover { background: var(--color-bg-muted); }

	.activity-toggle button[aria-pressed='true'] {
		background: var(--color-accent-light);
		color: var(--color-accent-dark);
		font-weight: 600;
	}

	.timeline {
		position: relative;
		list-style: none;
		margin: 0;
		padding: 0 0 0 20px;
	}

	/* Le trait vertical relie les pastilles */
	.timeline::before {
		content: '';
		position: absolute;
		left: 5px;
		top: 4px;
		bottom: 4px;
		width: 2px;
		background: var(--color-border);
	}

	.timeline-item {
		position: relative;
		margin-bottom: 1rem;
	}

	.timeline-item:last-child { margin-bottom: 0; }

	.timeline-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		border: 2px solid var(--color-ink);
		position: absolute;
		left: -20px;
		top: 3px;
		z-index: 1;
	}

	.timeline-body {
		display: flex;
		flex-direction: column;
		gap: 1px;
		min-width: 0;
		color: inherit;
		text-decoration: none;
	}

	.timeline-body:hover .timeline-label { color: var(--color-accent-dark); }

	.timeline-label {
		font-size: var(--text-sm);
		font-weight: 700;
		color: var(--color-text);
	}

	.timeline-detail {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.timeline-date {
		font-size: var(--text-2xs);
		color: var(--color-text-muted);
	}

	/* ─── En préparation ───────────────── */
	.prep-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.prep-card {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		min-height: 40px;
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--color-border-light);
		border-radius: var(--radius-md);
		text-decoration: none;
		color: inherit;
		background: var(--color-bg);
		transition: border-color 0.12s;
	}

	.prep-card:hover { border-color: var(--color-accent); }
	.prep-card :global(.prep-icon) { flex-shrink: 0; color: var(--color-text-muted); }

	.prep-name {
		flex: 1;
		min-width: 0;
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--color-text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.prep-meta {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		white-space: nowrap;
	}

	/* ─── Responsive ───────────────────── */
	@media (max-width: 700px) {
		main { padding: 1rem; }
		.dash-layout { grid-template-columns: minmax(0, 1fr); gap: 1.75rem; }
		.dash-side:not(:empty) { border-top: 1px solid var(--color-border-light); padding-top: 1.5rem; }
		.replay-head { padding: 0.75rem; gap: 0.75rem; }
		.replay-cover { width: 56px; height: 56px; }
	}
</style>
