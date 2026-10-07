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
	import PlayAllButton from '$lib/components/PlayAllButton.svelte'
	import type { PlayerTrack } from '$lib/player.svelte'
	import type { RecordingListItem } from '$lib/types'
	import Icon from '$lib/components/Icon.svelte'
	import SongFields from '$lib/components/SongFields.svelte'
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte'
	import { createSubmitConfirm } from '$lib/confirm-submit.svelte'
	import { SONG_STATUS_LABELS, songCredit, songHue } from '$lib/songs'
	import { enhance } from '$app/forms'

	let { data }: { data: PageData } = $props()

	// Mode édition de la fiche, comme sur une session : « Modifier » dans l'en-tête, le
	// formulaire sous l'en-tête, rien d'appliqué avant « Enregistrer ».
	let editing = $state(false)
	let saving = $state(false)
	let editError = $state<string | null>(null)
	// Fiche enregistrée, mais pochette du catalogue non importée : on le dit, sans défaire.
	let coverNotice = $state<string | null>(null)
	const ask = createSubmitConfirm()

	function startEditing() {
		editError = null
		coverNotice = null
		editing = true
	}

	function cancelEditing() {
		editing = false
		editError = null
	}

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
	// Le morceau est du groupe actif (le chargement filtre dessus) : c'est lui l'interprète.
	const groupName = $derived(data.user?.groups.find((g) => g.id === data.user?.current_group_id)?.name ?? null)
	const credit = $derived(songCredit(song, groupName))
	const allowPublicShare = $derived(
		!!data.user?.current_group_id && canSharePublicly(data.user, { groupId: data.user.current_group_id })
	)

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
		<p class="composer">
			<span class="artist">{credit.artist}</span>
			{#if credit.detail}· {credit.detail}{/if}
			{#if song.release_year}<span class="year">({song.release_year})</span>{/if}
		</p>
		{#if song.reference_duration_s}
			<p class="ref-duration">Durée de référence : {formatDuration(song.reference_duration_s)}</p>
		{/if}
		{#snippet actions()}
			{#if !editing}
				<button class="btn btn-ghost mh-secondary" onclick={startEditing}>
					<Icon name="pencil" size="0.9rem" /> <span class="mh-label">Modifier</span>
				</button>
				<a class="btn btn-ghost mh-secondary" href="/songs/{song.id}/partition">
					<Icon name="sheet" size="0.9rem" /> <span class="mh-label">Feuille de répétition</span>
				</a>
				<SongCoverEditor
					songId={song.id}
					title={song.title}
					coverVersion={song.cover_version}
					searchQuery={[song.title, song.original_artist].filter(Boolean).join(' ')}
				/>
				<PlayAllButton tracks={tracks} label="Écouter toutes les prises de {song.title} à la suite" />
			{/if}
		{/snippet}
	</MediaHeader>

	{#if coverNotice}
		<p class="message-error" role="alert">{coverNotice}</p>
	{/if}

	{#if editing}
		<form
			method="POST"
			action="?/update"
			class="form-section edit-form"
			use:enhance={() => {
				editError = null
				saving = true
				return async ({ result, update }) => {
					saving = false
					if (result.type === 'failure') {
						editError = (result.data as { error?: string } | undefined)?.error ?? 'Erreur.'
						return
					}
					const coverError = (result.type === 'success' ? result.data?.cover_error : null) as unknown
					coverNotice = typeof coverError === 'string' ? `La pochette n'a pas pu être importée : ${coverError}` : null
					await update()
					editing = false
				}
			}}
		>
			{#if editError}
				<p class="message-error" role="alert">{editError}</p>
			{/if}
			<SongFields {song} />
			<div class="form-actions">
				<button type="submit" class="btn btn-primary" disabled={saving}>
					{saving ? 'Enregistrement…' : 'Enregistrer'}
				</button>
				<button type="button" class="btn btn-ghost" onclick={cancelEditing} disabled={saving}>
					Annuler
				</button>
				<!-- Le formulaire de suppression est à part (pas de formulaires imbriqués) : ce
				     bouton le désigne par son id. Mêmes règles que le tableau de /songs. -->
				{#if recordings.length === 0}
					<button type="submit" form="song-delete" class="btn btn-danger delete-song" disabled={saving}>
						Supprimer le morceau
					</button>
				{:else}
					<button type="button" class="btn btn-danger delete-song" disabled title="Des prises existent">
						Supprimer le morceau
					</button>
				{/if}
			</div>
		</form>
		{#if recordings.length === 0}
			<form
				id="song-delete"
				method="POST"
				action="?/delete"
				hidden
				use:enhance={({ formElement, cancel }) => {
					if (ask.intercept(formElement, cancel, {
						level: 'danger',
						title: 'Supprimer ce morceau ?',
						message: `« ${song.title} » sera retiré du référentiel, avec ses paroles, ses notes, sa pochette, sa feuille de répétition et sa place dans les setlists. Cette action est irréversible.`,
						confirmLabel: 'Supprimer le morceau'
					})) return
					editError = null
					return async ({ result, update }) => {
						if (result.type === 'failure') {
							editError = (result.data as { error?: string } | undefined)?.error ?? 'Erreur.'
							return
						}
						await update()
					}
				}}
			></form>
		{/if}
	{:else}
		<SongDetails lyrics={song.lyrics} musicNotes={song.music_notes} />
	{/if}

	<!-- Avant la liste, pas après : sous un morceau de trente prises, il fallait tout
	     faire défiler pour les trouver. -->
	<div class="list-actions">
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

	<ConfirmDialog
		open={ask.pending !== null}
		level={ask.pending?.level}
		title={ask.pending?.title ?? ''}
		message={ask.pending?.message ?? ''}
		confirmLabel={ask.pending?.confirmLabel}
		onConfirm={ask.confirm}
		onCancel={ask.dismiss}
	/>
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
	.composer .artist { font-weight: 600; color: var(--color-text); }
	.composer .year { color: var(--color-text-muted); }
	.ref-duration { font-size: var(--text-sm); color: var(--color-text-muted); margin: 0; }

	.edit-form { margin-bottom: 1.5rem; }

	.form-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
	}

	/* La suppression s'écarte des deux autres : on ne la touche pas en visant « Annuler ». */
	.delete-song { margin-left: auto; }

	.message-error { margin: 0 0 1rem; }

	.list-actions { margin-bottom: 1.25rem; display: flex; flex-wrap: wrap; gap: 0.6rem; }


	/* Les prises se replient toutes seules (voir RecordingRow) : il ne reste ici que
	   ce qui entoure la liste. */
	@media (max-width: 640px) {

		/* La modale du sélecteur est en `position: fixed` : elle reste hors de ce flux. */
		/* Côte à côte tant qu'ils tiennent : empilés, ils repoussaient les prises sous l'écran. */
		.list-actions > :global(*) { flex: 1 1 auto; }
	}
</style>
