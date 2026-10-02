<script lang="ts">
	import type { PageData } from './$types'
	import { formatDateOnly } from '$lib/date'
	import SongDetails from '$lib/components/SongDetails.svelte'
	import RecordingRow from '$lib/components/RecordingRow.svelte'
	import AddToSetlistButton from '$lib/components/AddToSetlistButton.svelte'
	import SongCover from '$lib/components/SongCover.svelte'
	import SongCoverEditor from '$lib/components/SongCoverEditor.svelte'
	import MediaHeader from '$lib/components/MediaHeader.svelte'
	import { canSharePublicly, formatDurationLong } from '$lib/types'
	import { songHue } from '$lib/songs'
	import PlayAllButton from '$lib/components/PlayAllButton.svelte'
	import type { PlayerTrack } from '$lib/player.svelte'
	import type { RecordingListItem } from '$lib/types'
	import Icon from '$lib/components/Icon.svelte'

	let { data }: { data: PageData } = $props()

	type Song = {
		id: number; title: string; composer: string | null
		key: string | null; release_year: number | null
		original_artist: string | null; reference_duration_s: number | null
		lyrics: string | null
		music_notes: string | null; status: string
		cover_version: number | null
	}
	// La vue morceau ajoute au socle partagé la session d'où vient la prise : c'est ce
	// qui la situe dans le temps, toutes sessions confondues.
	type SongRecording = RecordingListItem & {
		session_id: number
		session_date: string
		session_location: string | null
	}

	const song = $derived(data.song as unknown as Song)
	const recordings = $derived(data.recordings as unknown as SongRecording[])
	const allowPublicShare = $derived(
		!!data.user?.current_group_id && canSharePublicly(data.user, { groupId: data.user.current_group_id })
	)

	const SONG_STATUS_LABELS: Record<string, string> = {
		en_apprentissage: 'En apprentissage',
		proposition_de_travail: 'Proposition de travail',
		au_repertoire: 'Au répertoire',
		abandonne: 'Abandonné'
	}

	function formatDate(d: string | Date) {
		return formatDateOnly(d, {
			day: 'numeric', month: 'long', year: 'numeric'
		})
	}

	function formatDuration(s: number | null) {
		if (!s) return '—'
		const m = Math.floor(s / 60)
		const sec = s % 60
		return `${m}:${String(sec).padStart(2, '0')}`
	}

	// « Tout écouter » : l'évolution du morceau, dans l'ordre de la page (récent d'abord).
	const tracks = $derived<PlayerTrack[]>(
		recordings
			.filter((r) => r.file_path)
			.map((r) => ({
				recordingId: r.id,
				songId: song.id,
				songTitle: song.title,
				take: r.take,
				sessionDate: r.session_date,
				durationS: r.duration_s
			}))
	)

	const totalDurationS = $derived(recordings.reduce((n, r) => n + (r.duration_s ?? 0), 0))
	const sessionCount = $derived(new Set(recordings.map((r) => r.session_id)).size)
	const songStats = $derived(
		recordings.length === 0
			? null
			: [
					`${recordings.length} prise${recordings.length > 1 ? 's' : ''}`,
					`${sessionCount} session${sessionCount > 1 ? 's' : ''}`,
					totalDurationS > 0 ? formatDurationLong(totalDurationS) : null
				]
					.filter(Boolean)
					.join(' · ')
	)

</script>

<svelte:head>
	<title>{song.title} — Historique</title>
</svelte:head>

<main class="page page-wide">
	<nav class="breadcrumb">
		<a href="/songs">Morceaux</a> /
		<span>{song.title}</span>
	</nav>

	<MediaHeader title={song.title} stats={songStats} hue={songHue(song.id)}>
		{#snippet kicker()}
			Morceau
			<span class="badge badge-{song.status} song-status">
				{SONG_STATUS_LABELS[song.status] ?? song.status}
			</span>
			{#if song.key}<span class="key">{song.key}</span>{/if}
		{/snippet}
		{#snippet cover()}
			<SongCover songId={song.id} title={song.title} coverVersion={song.cover_version} />
		{/snippet}
		{#if song.composer || song.original_artist || song.release_year}
			<p class="composer">
				{song.composer ?? ''}
				{#if song.original_artist}
					{song.composer ? '—' : ''} reprise de {song.original_artist}
				{/if}
				{#if song.release_year}<span class="year">({song.release_year})</span>{/if}
			</p>
		{/if}
		{#if song.reference_duration_s}
			<p class="ref-duration">Durée de référence : {formatDuration(song.reference_duration_s)}</p>
		{/if}
		{#snippet actions()}
			<a class="btn btn-secondary" href="/songs/{song.id}/partition">Partition / paroles</a>
			<SongCoverEditor
				songId={song.id}
				title={song.title}
				coverVersion={song.cover_version}
				searchQuery={[song.title, song.original_artist].filter(Boolean).join(' ')}
			/>
			<PlayAllButton tracks={tracks} label="Écouter toutes les prises de {song.title} à la suite" />
		{/snippet}
	</MediaHeader>

	<SongDetails lyrics={song.lyrics} musicNotes={song.music_notes} />

	{#if recordings.length === 0}
		<p class="empty">Aucune prise pour ce morceau.</p>
	{:else}
		<!-- À plat, des plus récentes aux plus anciennes : chaque prise porte sa session
		     en titre, comme une piste de playlist porte son morceau. -->
		<div class="recording-list">
			{#each recordings as r (r.id)}
				<RecordingRow
					recording={r}
					songId={song.id}
					songTitle={song.title}
					sessionDate={r.session_date}
					{allowPublicShare}
					session={{ id: r.session_id, label: formatDate(r.session_date), location: r.session_location }}
				/>
			{/each}
		</div>
	{/if}

	<div class="footer-actions">
		<a href="/upload?song_id={song.id}" class="btn btn-primary"><Icon name="plus" /> Ajouter une prise</a>
		<!-- Une setlist programme des morceaux, pas des prises : l'action appartient donc à
		     la page du morceau, pas aux lignes de prises qui portent celle des playlists. -->
		<AddToSetlistButton
			songId={song.id}
			songStatus={song.status}
			label="Ajouter à une setlist"
			buttonClass="btn btn-secondary"
		/>
	</div>
</main>

<style>
	/* Pastilles glissées dans le libellé de l'en-tête : elles gardent leur propre casse. */
	.song-status { letter-spacing: 0; text-transform: none; }

	.key {
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0;
		text-transform: none;
		background: var(--color-chip-bg);
		color: var(--color-text-secondary);
		padding: 0.15rem 0.45rem;
		border-radius: var(--radius-sm);
	}

	.composer { font-size: var(--text-sm); color: var(--color-text-secondary); margin: 0; }
	.composer .year { color: var(--color-text-muted); }
	.ref-duration { font-size: var(--text-sm); color: var(--color-text-muted); margin: 0; }

	.footer-actions { margin-top: 2rem; display: flex; flex-wrap: wrap; gap: 0.6rem; }


	/* Les prises se replient toutes seules (voir RecordingRow) : il ne reste ici que
	   ce qui entoure la liste. */
	@media (max-width: 640px) {

		/* La modale du sélecteur est en `position: fixed` : elle reste hors de ce flux. */
		.footer-actions { flex-direction: column; align-items: stretch; }
	}
</style>
