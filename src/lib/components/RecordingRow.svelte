<script lang="ts">
	import RecordingComments from '$lib/components/RecordingComments.svelte'
	import RecordingPlaybackActions from '$lib/components/RecordingPlaybackActions.svelte'
	import { tick } from 'svelte'
	import type { RecordingListItem } from '$lib/types'

	let {
		recording,
		songId,
		songTitle,
		sessionDate,
		editableQuality = false,
		editMode = false,
		canDelete = false,
		canMoveUp = false,
		canMoveDown = false,
		deleting = false,
		onQualityChange = null,
		onMove = null,
		onDelete = null
	}: {
		recording: RecordingListItem
		songId: number
		songTitle: string
		sessionDate: string
		/** La qualité ne se règle que dans la vue session ; ailleurs, simple badge. */
		editableQuality?: boolean
		editMode?: boolean
		canDelete?: boolean
		canMoveUp?: boolean
		canMoveDown?: boolean
		deleting?: boolean
		/** Prévient la page pour qu'elle mette sa copie locale à jour. */
		onQualityChange?: ((status: string) => void) | null
		onMove?: ((direction: -1 | 1) => void) | null
		onDelete?: (() => void) | null
	} = $props()

	// `file_path` ("{id}.mp3") ne sert de nom affiché que pour les prises d'avant la
	// migration 023, déposées quand le nom d'origine n'était pas encore conservé.
	// 🎬 signale une vidéo : seule (son titre), ou accompagnée de sa piste audio (le fichier).
	const sourceName = $derived(
		recording.file_path
			? `${recording.youtube_video_id ? '🎬 ' : ''}${recording.source_file_name ?? recording.file_path}`
			: `🎬 ${recording.youtube_title ?? 'Vidéo YouTube'}`
	)
	const sourceTitle = $derived(
		[
			recording.file_path &&
				(recording.source_file_name
					? `Fichier déposé : ${recording.source_file_name}`
					: "Nom d'origine inconnu — prise déposée avant sa conservation"),
			recording.youtube_video_id &&
				`Vidéo YouTube : ${recording.youtube_title ?? recording.youtube_video_id}`
		]
			.filter(Boolean)
			.join('\n')
	)

	function formatDuration(s: number | null) {
		if (!s) return '—'
		const m = Math.floor(s / 60)
		const sec = s % 60
		return `${m}:${String(sec).padStart(2, '0')}`
	}

	const QUALITY_CLASS: Record<string, string> = {
		'À revoir': 'a-revoir', 'à revoir': 'a-revoir',
		'Moyen': 'moyen', 'moyen': 'moyen',
		'Bon': 'bon', 'bon': 'bon',
		'Référence': 'reference', 'référence': 'reference',
		'en_cours': 'a-revoir', 'au_point': 'bon', 'repertoire': 'reference',
	}
	const QUALITY_OPTIONS = ['À revoir', 'Moyen', 'Bon', 'Référence']

	function qualityClass(q: string) { return QUALITY_CLASS[q] ?? 'custom' }

	function presetQuality(q: string) {
		const normalized = q.trim().toLocaleLowerCase('fr-FR')
		return QUALITY_OPTIONS.find((option) => option.toLocaleLowerCase('fr-FR') === normalized)
			?? ({ en_cours: 'À revoir', au_point: 'Bon', repertoire: 'Référence' }[normalized] ?? null)
	}

	// Note et commentaires se déplient indépendamment : ce sont deux choses à lire sur
	// la même prise, et on peut vouloir les deux sous les yeux.
	let noteOpen = $state(false)
	let commentsOpen = $state(false)

	// La qualité est une pastille tant qu'on n'y touche pas : un `<select>` par ligne
	// occupait la largeur d'une colonne pour une valeur qui change rarement.
	let editingQuality = $state(false)
	let selectField = $state<HTMLSelectElement | null>(null)
	let customDraft = $state<string | null>(null)
	let saving = $state(false)
	let qualityError = $state<string | null>(null)

	async function openQuality() {
		editingQuality = true
		customDraft = presetQuality(recording.status) ? null : recording.status
		qualityError = null
		await tick()
		selectField?.focus()
	}

	function closeQuality() {
		editingQuality = false
		customDraft = null
		qualityError = null
	}

	async function saveQuality(status: string) {
		const value = status.trim()
		if (!value) { qualityError = 'Saisis une qualité.'; return }
		if (value === recording.status) { closeQuality(); return }

		saving = true
		qualityError = null
		try {
			const res = await fetch(`/api/recordings/${recording.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ status: value })
			})
			const json = await res.json()
			if (!res.ok) { qualityError = json.error ?? 'Erreur.'; return }
			onQualityChange?.(json.status)
			closeQuality()
		} catch {
			qualityError = 'Erreur réseau.'
		} finally {
			saving = false
			// Le `<select>` garde sinon la valeur refusée sous les yeux, comme si elle
			// était enregistrée : on le ramène à ce que la base dit.
			if (qualityError && selectField) selectField.value = presetQuality(recording.status) ?? 'custom'
		}
	}

	function chooseQuality(e: Event) {
		const value = (e.currentTarget as HTMLSelectElement).value
		if (value === 'custom') { customDraft = presetQuality(recording.status) ? '' : recording.status; return }
		customDraft = null
		saveQuality(value)
	}
</script>

<article class="recording-row">
	<div class="row-main">
		<div class="row-ident">
			<span class="take">#{recording.take}</span>
			<span class="duration">{formatDuration(recording.duration_s)}</span>

			{#if editableQuality && editingQuality}
				<span class="quality-edit">
					<select
						class="quality-select"
						bind:this={selectField}
						value={presetQuality(recording.status) ?? 'custom'}
						disabled={saving}
						aria-label="Qualité de la prise {recording.take}"
						onchange={chooseQuality}
						onkeydown={(e) => { if (e.key === 'Escape') closeQuality() }}
					>
						{#each QUALITY_OPTIONS as option}
							<option value={option}>{option}</option>
						{/each}
						<option value="custom">Autre…</option>
					</select>
					{#if customDraft !== null}
						<input
							type="text"
							class="quality-input"
							bind:value={customDraft}
							placeholder="Libellé personnalisé"
							maxlength="50"
							disabled={saving}
							aria-label="Libellé personnalisé pour la prise {recording.take}"
							onkeydown={(e) => {
								if (e.key === 'Enter') saveQuality(customDraft ?? '')
								else if (e.key === 'Escape') closeQuality()
							}}
						/>
						<button class="btn-mini" disabled={saving} onclick={() => saveQuality(customDraft ?? '')}>OK</button>
					{/if}
					<button class="btn-mini btn-mini-ghost" disabled={saving} onclick={closeQuality} title="Annuler">✕</button>
				</span>
			{:else if editableQuality}
				<button
					class="badge badge-quality-{qualityClass(recording.status)} quality-pill"
					onclick={openQuality}
					title="Changer la qualité de la prise"
				>{recording.status}</button>
			{:else}
				<span class="badge badge-quality-{qualityClass(recording.status)}">{recording.status}</span>
			{/if}

			{#if qualityError}<span class="row-error">{qualityError}</span>{/if}
		</div>

		<div class="row-actions">
			{#if recording.notes}
				<button
					class="chip"
					class:open={noteOpen}
					aria-expanded={noteOpen}
					onclick={() => (noteOpen = !noteOpen)}
					title={noteOpen ? 'Masquer la note' : 'Lire la note'}
				>📝</button>
			{:else}
				<!-- Rien à lire : on va écrire, et cela se fait dans le lecteur. -->
				<a
					href="/recording/{recording.id}#notes"
					class="chip chip-add"
					title="Ajouter une note dans le lecteur complet"
				>+ 📝</a>
			{/if}

			{#if recording.comment_count > 0}
				<button
					class="chip"
					class:open={commentsOpen}
					aria-expanded={commentsOpen}
					onclick={() => (commentsOpen = !commentsOpen)}
					title={commentsOpen ? 'Masquer les commentaires' : 'Lire les commentaires'}
				>💬 {recording.comment_count}</button>
			{:else}
				<a
					href="/recording/{recording.id}#commenter"
					class="chip chip-add"
					title="Ajouter un commentaire dans le lecteur complet"
				>+ 💬</a>
			{/if}

			<RecordingPlaybackActions
				recordingId={recording.id}
				{songId}
				{songTitle}
				take={recording.take}
				{sessionDate}
				durationS={recording.duration_s}
				hasAudio={!!recording.file_path}
			/>
		</div>
	</div>

	<div class="row-meta">
		<span
			class="file-name"
			class:fallback={!!recording.file_path && !recording.source_file_name}
			title={sourceTitle}
		>{sourceName}</span>
		<span class="sep">·</span>
		<span class="uploader">{recording.uploaded_by}</span>

		{#if editMode}
			<div class="row-edit">
				<button class="btn-reorder" disabled={!canMoveUp} onclick={() => onMove?.(-1)} title="Monter">↑</button>
				<button class="btn-reorder" disabled={!canMoveDown} onclick={() => onMove?.(1)} title="Descendre">↓</button>
				{#if canDelete}
					<button class="btn btn-danger btn-sm" disabled={deleting} onclick={() => onDelete?.()}>
						{deleting ? '…' : 'Supprimer'}
					</button>
				{/if}
			</div>
		{/if}
	</div>

	{#if recording.notes}
		<!-- Repliée, la note tient sur une ligne : trois mots de contexte ne valent pas
		     un clic. Dépliée, elle s'étale — et se modifie dans le lecteur, comme un
		     commentaire. -->
		<div class="row-note" class:open={noteOpen}>
			<button class="note-toggle" aria-expanded={noteOpen} onclick={() => (noteOpen = !noteOpen)}>
				<span class="note-icon">📝</span>
				<span class="note-text">{recording.notes}</span>
			</button>
			{#if noteOpen}
				<a href="/recording/{recording.id}#notes" class="drawer-link">Modifier dans le lecteur →</a>
			{/if}
		</div>
	{/if}

	{#if commentsOpen}
		<div class="row-drawer">
			<RecordingComments recordingId={recording.id} onSeek={null} />
			<a href="/recording/{recording.id}#commenter" class="drawer-link">
				Ajouter un commentaire dans le lecteur →
			</a>
		</div>
	{/if}
</article>

<style>
	/* Une prise est une ligne-carte à toutes les largeurs : le `flex-wrap` remplace la
	   bascule en cartes que le tableau demandait sous 640 px, et la page reste lisible
	   entre les deux — une colonne de contenu vaut la fenêtre moins la sidebar. */
	.recording-row {
		border: 1px solid var(--color-border-light);
		border-radius: var(--radius-lg);
		background: var(--color-bg);
		padding: 0.55rem 0.7rem;
		margin-bottom: 0.45rem;
	}

	.row-main {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem 0.75rem;
	}

	.row-ident {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.3rem 0.6rem;
	}

	.take { font-weight: 700; color: var(--color-text-secondary); }
	.duration { font-size: var(--text-sm); color: var(--color-text-secondary); }

	.row-actions {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin-left: auto;
	}

	/* Pastille de qualité : bouton sans allure de bouton, le badge fait tout. */
	.quality-pill {
		border: 1px solid transparent;
		font-family: inherit;
		cursor: pointer;
	}

	.quality-pill:hover { border-color: var(--color-accent); }

	.quality-edit {
		display: inline-flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.3rem;
	}

	.quality-select,
	.quality-input {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: 0.72rem;
		font-weight: 700;
		font-family: inherit;
		padding: 0.18rem 0.45rem;
		background: var(--color-bg);
		width: 7rem;
	}

	.quality-select:disabled,
	.quality-input:disabled { opacity: var(--disabled-opacity); cursor: not-allowed; }

	.btn-mini {
		padding: 0.15rem 0.5rem;
		background: var(--color-primary);
		color: #fff;
		border: none;
		border-radius: var(--radius-sm);
		font-size: 0.78rem;
		font-family: inherit;
		cursor: pointer;
	}

	.btn-mini-ghost {
		background: none;
		border: 1px solid var(--color-border-input);
		color: var(--color-text-muted);
	}

	.btn-mini:disabled { opacity: var(--disabled-opacity); cursor: not-allowed; }

	.row-error { font-size: 0.72rem; color: var(--color-error); }

	/* Note et commentaires partagent la même grammaire : une pastille quand il y a
	   quelque chose à lire, une pastille en pointillés quand il y a à écrire. */
	.chip {
		display: inline-block;
		background: var(--color-abandoned-bg);
		color: #444;
		border: 1px solid transparent;
		border-radius: 10px;
		padding: 0.15rem 0.5rem;
		font-size: var(--text-xs);
		font-weight: 600;
		font-family: inherit;
		line-height: 1.4;
		cursor: pointer;
		text-decoration: none;
		white-space: nowrap;
	}

	.chip:hover { border-color: var(--color-accent); }
	.chip.open { border-color: var(--color-accent); background: var(--color-accent-light); }

	.chip-add {
		background: none;
		border: 1px dashed var(--color-border);
		color: var(--color-text-muted);
		font-weight: 400;
	}

	.chip-add:hover { border-color: var(--color-accent); color: var(--color-accent); }

	.row-meta {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.2rem 0.4rem;
		margin-top: 0.3rem;
		font-size: var(--text-xs);
		color: var(--color-text-muted);
	}

	.file-name {
		min-width: 0;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--color-text-secondary);
	}

	.file-name.fallback { color: var(--color-text-muted); font-style: italic; }
	.sep { color: var(--color-border); }

	.row-edit {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		margin-left: auto;
	}

	.btn-reorder {
		background: none;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		padding: 0.1rem 0.35rem;
		font-size: 0.78rem;
		font-family: inherit;
		cursor: pointer;
		color: var(--color-text-secondary);
		line-height: 1;
	}

	.btn-reorder:hover:not(:disabled) { background: var(--color-bg-subtle); }
	.btn-reorder:disabled { opacity: var(--disabled-opacity); cursor: not-allowed; }

	.row-note { margin-top: 0.35rem; }

	.note-toggle {
		display: flex;
		align-items: baseline;
		gap: 0.35rem;
		width: 100%;
		background: none;
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		padding: 0.15rem 0.3rem;
		margin-left: -0.3rem;
		font-family: inherit;
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		text-align: left;
		cursor: pointer;
	}

	.note-toggle:hover { border-color: var(--color-border-light); background: var(--color-bg-subtle); }

	.note-icon { flex-shrink: 0; font-size: var(--text-xs); }

	.note-text {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.row-note.open .note-text { white-space: pre-wrap; overflow: visible; }

	.row-drawer {
		margin-top: 0.4rem;
		padding-top: 0.4rem;
		border-top: 1px solid var(--color-border-light);
	}

	.drawer-link {
		display: inline-block;
		margin-top: 0.2rem;
		font-size: var(--text-sm);
		color: var(--color-accent);
		text-decoration: none;
	}

	.drawer-link:hover { text-decoration: underline; }
</style>
