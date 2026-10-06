<script lang="ts">
	import type { PageData } from './$types'
	import { formatDateOnly, formatDateTime, nearDayLabel } from '$lib/date'
	import { formatTimecode } from '$lib/youtube'
	import { sessionTypeLabel } from '$lib/types'
	import Avatar from '$lib/components/Avatar.svelte'
	import Icon from '$lib/components/Icon.svelte'
	import RecordingPlaybackActions from '$lib/components/RecordingPlaybackActions.svelte'

	let { data }: { data: PageData } = $props()

	const member = $derived(data.member)
	const activity = $derived(data.activity)

	const GROUP_ROLE_LABELS: Record<string, string> = { member: 'Membre', admin: 'Admin du groupe' }
	const POST_KIND_LABELS: Record<string, string> = {
		recording: 'Enregistrement',
		youtube: 'Vidéo',
		song_suggestion: 'Suggestion de morceau'
	}

	// Les chiffres qui ont quelque chose à dire : un zéro n'apprend rien sur quelqu'un.
	const stats = $derived(
		[
			[activity.counts.recordings, 'prise déposée', 'prises déposées'],
			[activity.counts.comments, 'commentaire', 'commentaires'],
			[activity.counts.sessions, 'session créée', 'sessions créées'],
			[activity.counts.posts, 'publication', 'publications']
		]
			.filter(([n]) => (n as number) > 0)
			.map(([n, one, many]) => `${n} ${(n as number) > 1 ? many : one}`)
	)

	const isEmpty = $derived(
		!activity.recordings.length && !activity.comments.length && !activity.posts.length && !activity.unavailabilities.length
	)

	function sessionLabel(rec: { session_date: string; session_type: string; session_title: string | null }) {
		const date = formatDateOnly(rec.session_date, { day: 'numeric', month: 'short', year: 'numeric' })
		return rec.session_title ? `${rec.session_title} (${date})` : `${sessionTypeLabel(rec.session_type)} du ${date}`
	}

	function truncate(text: string, max = 140) {
		return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text
	}
</script>

<svelte:head>
	<title>{member.display_name}</title>
</svelte:head>

<main class="page page-narrow">
	<nav class="breadcrumb">
		<a href="/group">{data.groupName || 'Groupe'}</a> /
		<span>{member.display_name}</span>
	</nav>

	<header class="member-header">
		<Avatar userId={member.id} name={member.display_name} version={member.avatar_version} size="80px" full />
		<div class="member-id">
			<h1>{member.display_name}</h1>
			<p class="member-meta">
				<span class="badge badge-group-{member.group_role}">{GROUP_ROLE_LABELS[member.group_role] ?? member.group_role}</span>
				<span>@{member.nickname}</span>
				{#if member.joined_at}
					<span>· dans le groupe depuis {formatDateOnly(member.joined_at, { month: 'long', year: 'numeric' })}</span>
				{/if}
			</p>
			{#if member.instruments.length}
				<p class="member-instruments">{member.instruments.join(' · ')}</p>
			{/if}
			{#if stats.length}
				<p class="member-stats">{stats.join(' · ')}</p>
			{/if}
			{#if !member.active}
				<p class="member-inactive">Ce compte est désactivé.</p>
			{/if}
			{#if data.isSelf}
				<a href="/profile" class="btn btn-secondary btn-sm member-edit">
					<Icon name="pencil" size="0.9rem" /> Modifier mon profil
				</a>
			{/if}
		</div>
	</header>

	{#if isEmpty}
		<p class="empty">Rien de déposé ni de commenté dans {data.groupName} pour l'instant.</p>
	{/if}

	{#if activity.recordings.length}
		<section class="section">
			<h2 class="section-title">Dernières prises déposées</h2>
			<ul class="takes">
				{#each activity.recordings as rec (rec.id)}
					<li class="take">
						<div class="take-text">
							<a class="take-song" href="/recording/{rec.id}">
								{#if rec.has_video}<Icon name="video" size="0.85rem" label="Vidéo" />{/if}
								{rec.song_title} <span class="muted">· prise {rec.take}</span>
							</a>
							<span class="muted small">
								<a class="muted" href="/sessions/{rec.session_id}">{sessionLabel(rec)}</a>
								{#if rec.duration_s} · {formatTimecode(rec.duration_s)}{/if}
								{#if rec.comment_count > 0}
									· <Icon name="comment" size="0.8rem" label="Commentaires" /> {rec.comment_count}
								{/if}
							</span>
						</div>
						<RecordingPlaybackActions
							recordingId={rec.id}
							songId={rec.song_id}
							songTitle={rec.song_title}
							take={rec.take}
							sessionDate={rec.session_date}
							durationS={rec.duration_s}
							hasAudio={rec.has_audio}
						/>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if activity.comments.length}
		<section class="section">
			<h2 class="section-title">Derniers commentaires</h2>
			<ul class="plain-list">
				{#each activity.comments as c (c.id)}
					<li>
						<a class="entry" href={c.href}>
							<span class="entry-head">
								<span class="entry-title">{c.target_label}</span>
								<span class="muted small">{formatDateTime(c.created_at)}</span>
							</span>
							<span class="entry-body">{truncate(c.content)}</span>
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if activity.posts.length}
		<section class="section">
			<h2 class="section-title">Publications</h2>
			<ul class="plain-list">
				{#each activity.posts as p (p.id)}
					<li>
						<a class="entry" href="/posts/{p.id}">
							<span class="entry-head">
								<span class="entry-title">{p.title}</span>
								<span class="muted small">{POST_KIND_LABELS[p.type] ?? ''} · {formatDateTime(p.created_at)}</span>
							</span>
							{#if p.message}<span class="entry-body">{truncate(p.message)}</span>{/if}
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if activity.unavailabilities.length}
		<section class="section">
			<h2 class="section-title">Indisponibilités à venir</h2>
			<ul class="plain-list">
				{#each activity.unavailabilities as u (u.id)}
					<li>
						<a class="entry" href="/agenda?date={u.date}">
							<span class="entry-head">
								<span class="entry-title">
									{nearDayLabel(u.date) ?? formatDateOnly(u.date, { weekday: 'long', day: 'numeric', month: 'long' })}
								</span>
								{#if u.title}<span class="muted small">{u.title}</span>{/if}
							</span>
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</main>

<style>
	.member-header {
		display: flex;
		align-items: flex-start;
		gap: 1.25rem;
		margin-bottom: 2rem;
	}
	.member-id { min-width: 0; display: flex; flex-direction: column; gap: 0.35rem; }
	h1 { font-size: var(--text-xl); margin: 0; overflow-wrap: anywhere; }
	.member-meta {
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem;
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}
	.member-instruments { margin: 0; font-weight: 600; }
	.member-stats { margin: 0; font-size: var(--text-sm); color: var(--color-text-secondary); }
	.member-inactive { margin: 0; font-size: var(--text-sm); color: var(--color-text-muted); font-style: italic; }
	.member-edit { align-self: flex-start; margin-top: 0.25rem; }

	.empty { color: var(--color-text-muted); font-size: var(--text-sm); }
	.muted { color: var(--color-text-muted); }
	.small { font-size: var(--text-xs); }

	.takes, .plain-list { list-style: none; margin: 0; padding: 0; }

	.take {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.5rem 0;
		border-bottom: 1px solid var(--color-border-light);
	}
	.take:last-child { border-bottom: none; }
	.take-text { min-width: 0; display: flex; flex-direction: column; gap: 0.1rem; }
	.take-song { font-weight: 600; color: var(--color-text); text-decoration: none; overflow-wrap: anywhere; }
	.take-song:hover { text-decoration: underline; }

	.plain-list li { border-bottom: 1px solid var(--color-border-light); }
	.plain-list li:last-child { border-bottom: none; }
	.entry {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		padding: 0.55rem 0.4rem;
		margin: 0 -0.4rem;
		border-radius: var(--radius-sm);
		color: inherit;
		text-decoration: none;
	}
	.entry:hover { background: var(--color-bg-subtle); }
	.entry-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.25rem 0.6rem; }
	.entry-title { font-weight: 600; font-size: var(--text-sm); }
	.entry-body { font-size: var(--text-sm); color: var(--color-text-secondary); overflow-wrap: anywhere; }
</style>
