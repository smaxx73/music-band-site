<script lang="ts">
	import { formatDateOnly } from '$lib/date'
	import { qualityClass } from '$lib/quality'
	import Icon from '$lib/components/Icon.svelte'
	import TrackLead from '$lib/components/TrackLead.svelte'
	import TrackRow from '$lib/components/TrackRow.svelte'

	type Item = {
		recording_id: number
		take: number
		duration_s: number | null
		recording_status: string | null
		note: string | null
		song_title: string
		session_date: string
		session_location: string | null
	}

	// Une piste de playlist, en lecture : titrée par son morceau, comme une prise en vue
	// morceau l'est par sa session. Réordonner et retirer, c'est le mode édition de la
	// page (`PlaylistQueue`).
	let {
		item,
		position,
		current = false,
		playing = false,
		onToggle
	}: {
		item: Item
		position: number
		current?: boolean
		playing?: boolean
		onToggle: () => void
	} = $props()

	function formatDuration(s: number | null) {
		if (!s) return '—'
		return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
	}
</script>

{#snippet lead()}
	<TrackLead
		number={position}
		{current}
		{playing}
		playLabel="Écouter {item.song_title}, prise {item.take}"
		{onToggle}
	/>
{/snippet}

{#snippet title()}{item.song_title}{/snippet}

{#snippet meta()}
	Prise {item.take} · {formatDateOnly(item.session_date, { day: 'numeric', month: 'short', year: 'numeric' })}
	{#if item.session_location} · {item.session_location}{/if}
{/snippet}

{#snippet tags()}
	{#if item.recording_status}
		<span class="badge badge-quality-{qualityClass(item.recording_status)}">{item.recording_status}</span>
	{/if}
{/snippet}

{#snippet actions()}
	<a
		href="/recording/{item.recording_id}"
		class="btn btn-ghost btn-sm btn-icon row-quiet"
		title="Ouvrir le lecteur complet"
		aria-label="Ouvrir le lecteur complet"
	><Icon name="external" /></a>
	<button
		class="btn btn-secondary btn-sm btn-icon row-play"
		onclick={onToggle}
		title={playing ? 'Mettre en pause' : 'Écouter'}
		aria-label={playing ? 'Mettre en pause' : `Écouter ${item.song_title}, prise ${item.take}`}
	><Icon name={playing ? 'pause' : 'play'} /></button>
{/snippet}

{#snippet aside()}{formatDuration(item.duration_s)}{/snippet}

{#snippet note()}<p class="note">{item.note}</p>{/snippet}

<TrackRow {current} hasAudio {lead} {title} {meta} {tags} {actions} {aside} below={item.note ? note : undefined} />

<style>
	.note {
		margin: 0;
		font-size: var(--text-xs);
		font-style: italic;
		color: var(--color-text-secondary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
