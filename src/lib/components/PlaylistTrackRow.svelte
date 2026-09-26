<script lang="ts">
	import { formatDateOnly } from '$lib/date'
	import { qualityClass } from '$lib/quality'
	import Icon from '$lib/components/Icon.svelte'
	import TrackLead from '$lib/components/TrackLead.svelte'

	type Item = {
		recording_id: number
		take: number
		duration_s: number | null
		recording_status: string
		note: string | null
		song_title: string
		session_date: string
		session_location: string | null
	}

	// Une piste de playlist, en lecture : la même grammaire que les prises d'une session
	// (`RecordingRow`), sans ce qui s'y édite. Réordonner et retirer, c'est le mode
	// édition de la page (`PlaylistQueue`).
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

<article class="playlist-row track-row" class:current>
	<div class="row-lead">
		<TrackLead
			number={position}
			{current}
			{playing}
			playLabel="Écouter {item.song_title}, prise {item.take}"
			{onToggle}
		/>
	</div>

	<div class="row-body">
		<span class="row-title">{item.song_title}</span>
		<span class="row-meta">
			Prise {item.take} · {formatDateOnly(item.session_date, { day: 'numeric', month: 'short', year: 'numeric' })}
			{#if item.session_location} · {item.session_location}{/if}
		</span>
		{#if item.note}<span class="row-note">{item.note}</span>{/if}
	</div>

	<div class="row-tags">
		<span class="badge badge-quality-{qualityClass(item.recording_status)}">{item.recording_status}</span>
	</div>

	<div class="row-actions">
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
		<span class="duration">{formatDuration(item.duration_s)}</span>
	</div>
</article>

<style>
	/* Mêmes mesures que `RecordingRow` : une playlist et une session se lisent pareil. */
	.playlist-row {
		container-type: inline-size;
		display: grid;
		grid-template-columns: 2rem minmax(0, 1fr) auto auto;
		grid-template-areas: 'lead body tags actions';
		align-items: center;
		column-gap: 0.75rem;
		padding: 0.4rem 0.6rem 0.4rem 0.3rem;
		margin-bottom: 2px;
		border-radius: var(--radius-lg);
		transition: background 0.12s;
	}

	.playlist-row.current { background: color-mix(in srgb, var(--color-accent-light) 55%, var(--color-bg)); }

	.row-lead { grid-area: lead; }

	.row-body {
		grid-area: body;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.row-title {
		font-weight: 600;
		font-size: 0.95rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.current .row-title { color: var(--color-accent); }

	.row-meta,
	.row-note {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.row-note { font-style: italic; color: var(--color-text-secondary); }

	.row-tags { grid-area: tags; }

	.row-actions {
		grid-area: actions;
		display: flex;
		align-items: center;
		gap: 0.2rem;
	}

	.duration {
		min-width: 2.6rem;
		text-align: right;
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		font-variant-numeric: tabular-nums;
	}

	/* Ligne étroite : le badge de qualité s'efface plutôt que d'écraser le titre ;
	   il reste lisible sur la page de la prise. */
	@container (max-width: 420px) {
		.playlist-row {
			grid-template-columns: 2rem minmax(0, 1fr) auto;
			grid-template-areas: 'lead body actions';
		}
		.row-tags { display: none; }
	}

	/* Souris : ▶ au survol du numéro (`TrackLead`), le bouton ▶ de droite s'efface,
	   le lecteur complet ne paraît qu'au survol. Au doigt, le ▶ reste un vrai bouton. */
	@media (hover: hover) and (pointer: fine) {
		.playlist-row:hover { background: var(--color-bg-muted); }
		.playlist-row.current:hover { background: color-mix(in srgb, var(--color-accent-light) 80%, var(--color-bg)); }
		.row-play { display: none; }
		.row-quiet { opacity: 0; transition: opacity 0.12s; }
		.playlist-row:hover .row-quiet,
		.playlist-row:focus-within .row-quiet { opacity: 1; }
	}

	@media (max-width: 640px) {
		.row-actions .btn { min-width: 44px; min-height: 44px; }
	}
</style>
