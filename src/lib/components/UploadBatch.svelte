<script lang="ts" generics="T extends { id: number; title: string }">
	import SongSelect from '$lib/components/SongSelect.svelte'
	import { formatDateOnly } from '$lib/date'
	import type { CreatedSong } from '$lib/songs'
	import { batchItemSettled, type BatchItem } from '$lib/upload-client'

	/**
	 * Fichiers d'un envoi par lots, un par ligne, chacun avec son morceau et son état.
	 * Dans l'ordre où ils ont été enregistrés : c'est celui dans lequel ils partent, donc
	 * celui des numéros de prise quand deux fichiers visent le même morceau.
	 */
	let {
		items = $bindable(),
		songs,
		oncreate,
		onremove,
		disabled = false
	}: {
		items: BatchItem[]
		songs: T[]
		oncreate: (song: CreatedSong) => void
		onremove: (key: number) => void
		disabled?: boolean
	} = $props()

	function recordedAt(file: File) {
		return new Date(file.lastModified).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
	}

	function formatDuration(seconds: number) {
		const total = Math.round(seconds)
		return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
	}

	/** Ce que la ligne dit du fichier : sa durée retenue s'il est enregistré sur place. */
	function meta(item: BatchItem) {
		const kept = item.trim ? item.trim.endS - item.trim.startS : item.durationS
		return [
			kept !== undefined ? `${formatDuration(kept)}${item.trim ? ' recadrée' : ''}` : null,
			`${(item.file.size / 1024 / 1024).toFixed(1)} Mo`,
			item.label ? null : recordedAt(item.file)
		].filter(Boolean).join(' · ')
	}
</script>

<ol class="batch">
	{#each items as item, i (item.key)}
		<li class="batch-item" class:done={item.status === 'done'} class:failed={item.status === 'error'}>
			<div class="batch-head">
				<span class="batch-index">{i + 1}</span>
				<span class="batch-name" title={item.label ?? item.file.name}>{item.label ?? item.file.name}</span>
				<span class="batch-meta">{meta(item)}</span>
				{#if !batchItemSettled(item)}
					<button
						type="button"
						class="btn-link btn-link-muted"
						onclick={() => onremove(item.key)}
						disabled={disabled}
						aria-label="Retirer {item.label ?? item.file.name}"
					>Retirer</button>
				{/if}
			</div>

			{#if item.previewUrl && !batchItemSettled(item)}
				<!-- Le fichier entier, recadrage compris : on réécoute pour reconnaître le morceau. -->
				<audio class="batch-audio" controls preload="none" src={item.previewUrl}></audio>
			{/if}

			{#if item.status === 'done' && item.recording}
				<p class="message-ok">
					{songs.find((s) => String(s.id) === item.songId)?.title ?? 'Morceau'} — prise {item.recording.take} ajoutée.
					<a href="/recording/{item.recording.id}">Ouvrir →</a>
				</p>
			{:else if item.status === 'duplicate' && item.duplicate}
				<p class="batch-duplicate">
					Déjà ajouté : <strong>{item.duplicate.song_title}</strong>, prise {item.duplicate.take}
					({formatDateOnly(item.duplicate.session_date, { day: '2-digit', month: 'short', year: 'numeric' })}).
					<a href="/recording/{item.duplicate.id}">Voir →</a>
				</p>
			{:else}
				<SongSelect
					{songs}
					bind:value={item.songId}
					{oncreate}
					ariaLabel="Morceau de {item.label ?? item.file.name}"
					placeholderAt={new Date(item.file.lastModified)}
					required
					disabled={disabled}
				/>
				{#if item.status === 'sending' || item.status === 'converting'}
					<div class="progress-bar" aria-hidden="true">
						<div class="progress-bar-fill" style="width: {item.progress}%"></div>
					</div>
					<p class="hint">
						{item.status === 'sending' ? `Envoi… ${item.progress}%` : 'Conversion audio…'}
					</p>
				{:else if item.status === 'error'}
					<p class="message-error">{item.error}</p>
				{:else if item.proposedSong !== '' && item.songId === item.proposedSong}
					<p class="hint">
						{item.proposedFrom === 'previous' ? 'Même morceau que la prise précédente.' : "Proposé d'après le nom du fichier."}
					</p>
				{/if}
			{/if}
		</li>
	{/each}
</ol>

<style>
	.batch {
		list-style: none;
		margin: 0.9rem 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.batch-item {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		padding: 0.6rem 0.75rem;
		border: 1px solid var(--color-border-light);
		border-radius: var(--radius-md);
		background: var(--color-bg);
	}

	.batch-item.done { background: var(--color-bg-subtle); }
	.batch-item.failed { border-color: var(--color-error); }

	.batch-head {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		min-width: 0;
	}

	.batch-index {
		flex: none;
		color: var(--color-text-muted);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
	}

	.batch-name {
		flex: 1 1 auto;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.batch-meta {
		flex: none;
		color: var(--color-text-muted);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
	}

	.batch-audio { width: 100%; height: 36px; }

	.batch-duplicate {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--color-warning-text);
	}

	.hint {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
	}

	.progress-bar {
		height: 6px;
		background: var(--color-border);
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.progress-bar-fill {
		height: 100%;
		background: var(--color-primary);
		transition: width 0.2s;
	}

	@media (max-width: 640px) {
		.batch-head { flex-wrap: wrap; }
		.batch-meta { order: 3; flex-basis: 100%; padding-left: 1.1rem; }
	}
</style>
