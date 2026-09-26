<script lang="ts">
	import AddToPlaylistButton from '$lib/components/AddToPlaylistButton.svelte'
	import RecordingComments from '$lib/components/RecordingComments.svelte'
	import RecordingPlaybackActions from '$lib/components/RecordingPlaybackActions.svelte'
	import Icon from '$lib/components/Icon.svelte'
	import TrackLead from '$lib/components/TrackLead.svelte'
	import { qualityClass } from '$lib/quality'
	import { player } from '$lib/player.svelte'
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
		deleting = false,
		onQualityChange = null,
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
		deleting?: boolean
		/** Prévient la page pour qu'elle mette sa copie locale à jour. */
		onQualityChange?: ((status: string) => void) | null
		onDelete?: (() => void) | null
	} = $props()

	// `file_path` ("{id}.mp3") ne sert de nom affiché que pour les prises d'avant la
	// migration 023, déposées quand le nom d'origine n'était pas encore conservé.
	const sourceName = $derived(
		recording.file_path
			? (recording.source_file_name ?? recording.file_path)
			: (recording.youtube_title ?? 'Vidéo YouTube')
	)
	const hasAudio = $derived(!!recording.file_path)

	// La prise que joue le mini-lecteur se signale dans la liste, comme la piste en
	// cours d'une plateforme de streaming : on la retrouve sans lire la barre du bas.
	const isCurrent = $derived(player.track?.recordingId === recording.id)
	const isPlaying = $derived(isCurrent && player.isPlaying)

	function togglePlayback() {
		player.toggleTrack({
			recordingId: recording.id,
			songId,
			songTitle,
			take: recording.take,
			sessionDate,
			durationS: recording.duration_s
		})
	}

	// L'icône vidéo signale une prise filmée : vidéo seule, ou accompagnée de sa piste audio.
	const hasVideo = $derived(!!recording.youtube_video_id)
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

	const QUALITY_OPTIONS = ['À revoir', 'Moyen', 'Bon', 'Référence']


	function presetQuality(q: string) {
		const normalized = q.trim().toLocaleLowerCase('fr-FR')
		return QUALITY_OPTIONS.find((option) => option.toLocaleLowerCase('fr-FR') === normalized)
			?? ({ en_cours: 'À revoir', au_point: 'Bon', repertoire: 'Référence' }[normalized] ?? null)
	}

	// Note et commentaires se déplient indépendamment : ce sont deux choses à lire sur
	// la même prise, et on peut vouloir les deux sous les yeux.
	let noteOpen = $state(false)
	let commentsOpen = $state(false)

	// Menu de la prise : tout ce qui se fait ailleurs que sur la ligne. Sa composition
	// ne dépend pas de ce que la prise contient déjà — un menu qui fondrait à une seule
	// entrée sur les prises vécues vaudrait moins que le bouton qu'il remplace.
	let menuOpen = $state(false)
	let playlistOpen = $state(false)
	let menuRoot = $state<HTMLElement | null>(null)
	let menuButton = $state<HTMLButtonElement | null>(null)
	let menuPanel = $state<HTMLElement | null>(null)

	// Les écouteurs ne vivent que le temps de l'ouverture : une session affiche des
	// dizaines de prises, et autant de `<svelte:window>` permanents pour un menu fermé.
	$effect(() => {
		if (!menuOpen) return

		const closeOnOutside = (e: MouseEvent) => {
			if (menuRoot && !menuRoot.contains(e.target as Node)) menuOpen = false
		}
		const closeOnEscape = (e: KeyboardEvent) => {
			if (e.key !== 'Escape') return
			menuOpen = false
			menuButton?.focus()
		}

		document.addEventListener('click', closeOnOutside)
		document.addEventListener('keydown', closeOnEscape)
		return () => {
			document.removeEventListener('click', closeOnOutside)
			document.removeEventListener('keydown', closeOnEscape)
		}
	})

	// La dernière prise d'une liste ouvre son menu près du bas de la zone défilante :
	// on l'amène à l'écran plutôt que de laisser l'utilisateur deviner qu'il doit défiler.
	$effect(() => {
		if (menuOpen && menuPanel) menuPanel.scrollIntoView({ block: 'nearest' })
	})

	function openPlaylist() {
		menuOpen = false
		playlistOpen = true
	}

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

<article
	class="recording-row track-row"
	class:has-audio={hasAudio}
	class:current={isCurrent}
	class:playing={isPlaying}
	class:expanded={commentsOpen}
>
	<div class="row-grid">
		<div class="row-lead">
			<TrackLead
				number={recording.take}
				current={isCurrent}
				playing={isPlaying}
				playLabel="Écouter la prise {recording.take}"
				onToggle={hasAudio ? togglePlayback : null}
			/>
		</div>

		<div class="row-body">
			<!-- Le numéro de la colonne de tête s'efface au survol et pendant la lecture :
			     le titre le porte donc aussi. -->
			<span class="row-title">
				{#if hasVideo}<Icon name="video" size="0.85rem" label="Prise vidéo" />{/if}
				Prise {recording.take}
			</span>
			<div class="row-meta">
				<span
					class="file-name"
					class:fallback={!!recording.file_path && !recording.source_file_name}
					title={sourceTitle}
				>{sourceName}</span>
				<span class="sep">·</span>
				<span class="uploader">{recording.uploaded_by}</span>
			</div>
		</div>

		<div class="row-tags">
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
					<button class="btn-mini btn-mini-ghost" disabled={saving} onclick={closeQuality} title="Annuler">
						<Icon name="close" size="0.8rem" label="Annuler" />
					</button>
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

			<!-- Ce qu'il y a à lire sur la prise : une pastille ne paraît que s'il y a
			     quelque chose, et elle le déplie sur place. -->
			{#if recording.notes}
				<button
					class="chip"
					class:open={noteOpen}
					aria-expanded={noteOpen}
					onclick={() => (noteOpen = !noteOpen)}
					title={noteOpen ? 'Masquer la note' : 'Lire la note'}
				><Icon name="pencil" size="0.85rem" /></button>
			{/if}
			{#if recording.comment_count > 0}
				<button
					class="chip"
					class:open={commentsOpen}
					aria-expanded={commentsOpen}
					onclick={() => (commentsOpen = !commentsOpen)}
					title={commentsOpen ? 'Masquer les commentaires' : 'Lire les commentaires'}
				><Icon name="comment" size="0.85rem" /> {recording.comment_count}</button>
			{/if}
		</div>

		<div class="row-actions">
			<!-- `.row-quiet` : ce qui s'écrit ou s'ouvre ailleurs. À la souris, ça ne paraît
			     qu'au survol de la ligne, comme les actions d'une piste de streaming. Sous
			     640 px, `.row-wide-only` le retire et le menu ⋮ le recueille. -->
			{#if !recording.notes}
				<a
					href="/recording/{recording.id}#notes"
					class="chip chip-add row-wide-only row-quiet"
					title="Ajouter une note dans le lecteur complet"
				><Icon name="plus" size="0.7rem" /><Icon name="pencil" size="0.85rem" /></a>
			{/if}
			{#if recording.comment_count === 0}
				<a
					href="/recording/{recording.id}#commenter"
					class="chip chip-add row-wide-only row-quiet"
					title="Ajouter un commentaire dans le lecteur complet"
				><Icon name="plus" size="0.7rem" /><Icon name="comment" size="0.85rem" /></a>
			{/if}

			{#if recording.file_path}
				<a
					href="/recording/{recording.id}"
					class="btn btn-ghost btn-sm btn-icon row-wide-only row-quiet"
					title="Ouvrir le lecteur complet"
					aria-label="Ouvrir le lecteur complet"
				>
					<Icon name="external" />
				</a>
			{/if}

			<!-- Même instance des deux côtés : le bouton porte la modale, et l'entrée de
			     menu l'ouvre par le lien `bind:`. `.row-quiet` vise le bouton seul — posée
			     sur un conteneur, l'opacité emporterait aussi la modale. -->
			<AddToPlaylistButton
				recordingId={recording.id}
				hasAudio={!!recording.file_path}
				bind:open={playlistOpen}
				buttonClass="btn btn-ghost btn-sm row-wide-only row-quiet"
			/>

			<span class="row-play">
				<RecordingPlaybackActions
					recordingId={recording.id}
					{songId}
					{songTitle}
					take={recording.take}
					{sessionDate}
					durationS={recording.duration_s}
					hasAudio={hasAudio}
				/>
			</span>

			<span class="duration">{formatDuration(recording.duration_s)}</span>

			{#if editMode && canDelete}
				<button class="btn btn-danger btn-sm" disabled={deleting} onclick={() => onDelete?.()}>
					{deleting ? '…' : 'Supprimer'}
				</button>
			{/if}

			<div class="row-menu" bind:this={menuRoot}>
				<button
					class="btn btn-ghost btn-sm btn-icon row-menu-button"
					bind:this={menuButton}
					onclick={() => (menuOpen = !menuOpen)}
					aria-expanded={menuOpen}
					aria-haspopup="menu"
					title="Autres actions"
					aria-label="Autres actions sur la prise {recording.take}"
				>
					<Icon name="more" />
				</button>

				{#if menuOpen}
					<div class="row-menu-panel" role="menu" bind:this={menuPanel}>
						{#if recording.file_path}
							<!-- Sans piste audio, « Voir » mène déjà à la page de la prise. -->
							<a href="/recording/{recording.id}" class="btn btn-ghost row-menu-item" role="menuitem">
								Ouvrir le lecteur complet
							</a>
							<button class="btn btn-ghost row-menu-item" role="menuitem" onclick={openPlaylist}>
								Ajouter à une playlist
							</button>
						{/if}
						<a href="/recording/{recording.id}#notes" class="btn btn-ghost row-menu-item" role="menuitem">
							{recording.notes ? 'Modifier la note' : 'Ajouter une note'}
						</a>
						<a href="/recording/{recording.id}#commenter" class="btn btn-ghost row-menu-item" role="menuitem">
							Ajouter un commentaire
						</a>
					</div>
				{/if}
			</div>
		</div>

		{#if recording.notes}
			<!-- Repliée, la note tient sur une ligne : trois mots de contexte ne valent pas
			     un clic. Dépliée, elle s'étale — et se modifie dans le lecteur, comme un
			     commentaire. -->
			<div class="row-note" class:open={noteOpen}>
				<button class="note-toggle" aria-expanded={noteOpen} onclick={() => (noteOpen = !noteOpen)}>
					<Icon name="pencil" class="note-icon" size="0.85rem" />
					<span class="note-text">{recording.notes}</span>
				</button>
				{#if noteOpen}
					<a href="/recording/{recording.id}#notes" class="btn btn-secondary btn-sm drawer-action">
						<Icon name="pencil" size="0.85rem" /> Modifier dans le lecteur
					</a>
				{/if}
			</div>
		{/if}
	</div>

	{#if commentsOpen}
		<div class="row-drawer">
			<RecordingComments recordingId={recording.id} onSeek={null} />
			<a href="/recording/{recording.id}#commenter" class="btn btn-secondary btn-sm drawer-action">
				<Icon name="comment" size="0.85rem" /> Commenter dans le lecteur
			</a>
		</div>
	{/if}
</article>

<style>
	/* Une prise est une piste de tracklist : pas de cadre, un fond au survol, la durée
	   calée à droite. Elle ne redevient une carte que dépliée (commentaires), pour que
	   le tiroir ait des bords à rejoindre. La grille se replie sur la largeur de la
	   ligne elle-même (requête de conteneur), pas sur celle de la fenêtre : la colonne
	   de contenu vaut la fenêtre moins la sidebar. */
	.recording-row {
		container-type: inline-size;
		border-radius: var(--radius-lg);
		padding: 0.4rem 0.6rem 0.4rem 0.3rem;
		margin-bottom: 2px;
		transition: background 0.12s;
	}

	/* Orangé très pâle : assez pour retrouver la prise en cours, sans concurrencer
	   la pastille de qualité. */
	.recording-row.current { background: color-mix(in srgb, var(--color-accent-light) 55%, var(--color-bg)); }

	.recording-row.expanded,
	.recording-row.expanded:hover {
		background: var(--color-bg);
		box-shadow: inset 0 0 0 1px var(--color-border-light);
		margin-block: 0.35rem;
	}

	.row-grid {
		display: grid;
		grid-template-columns: 2rem minmax(0, 1fr) auto auto;
		grid-template-areas:
			'lead body tags actions'
			'.    note note note';
		align-items: center;
		column-gap: 0.75rem;
	}

	/* Ligne étroite : les pastilles passent sous le titre, les commandes restent à
	   droite. Le groupe de commandes ne se scinde jamais. */
	@container (max-width: 560px) {
		.row-grid {
			grid-template-columns: 2rem minmax(0, 1fr) auto;
			grid-template-areas:
				'lead body actions'
				'.    tags tags'
				'.    note note';
			row-gap: 0.3rem;
		}
	}

	.row-lead { grid-area: lead; }

	/* Souris seulement : le numéro devient ▶ au survol (`TrackLead`), et le bouton ▶
	   de droite s'efface. Au doigt, le ▶ reste un vrai bouton. Même règle pour les
	   commandes discrètes (`.row-quiet`). */
	@media (hover: hover) and (pointer: fine) {
		.recording-row:hover { background: var(--color-bg-muted); }
		.recording-row.current:hover { background: color-mix(in srgb, var(--color-accent-light) 80%, var(--color-bg)); }

		.has-audio .row-play { display: none; }

		.row-actions :global(.row-quiet) { opacity: 0; transition: opacity 0.12s; }
		.recording-row:hover .row-actions :global(.row-quiet),
		.recording-row:focus-within .row-actions :global(.row-quiet) { opacity: 1; }
	}

	/* ─── Corps, pastilles, commandes ─────────────────── */
	.row-body {
		grid-area: body;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.row-title {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		font-weight: 600;
		font-size: 0.95rem;
	}

	.current .row-title { color: var(--color-accent); }

	.row-tags {
		grid-area: tags;
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.3rem 0.4rem;
	}

	.row-actions {
		grid-area: actions;
		display: flex;
		align-items: center;
		flex-wrap: nowrap;
		gap: 0.2rem;
	}

	.row-play { display: inline-flex; }

	.duration {
		min-width: 2.6rem;
		text-align: right;
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		font-variant-numeric: tabular-nums;
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

	/* Note et commentaires partagent la même grammaire : une pastille ne paraît que
	   s'il y a quelque chose à lire, et elle le déplie sur place. Écrire le premier
	   commentaire ou la première note se fait depuis le menu, comme tout ce qui
	   demande d'ouvrir le lecteur. */
	.chip {
		display: inline-flex;
		align-items: center;
		justify-content: center;
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
		gap: 0.25rem;
	}

	.chip:hover { border-color: var(--color-accent); }
	.chip.open { border-color: var(--color-accent); background: var(--color-accent-light); }

	/* Pastille en pointillés : il n'y a rien à lire, il y a à écrire. Elle ne paraît
	   que sur grand écran — sous 640 px, l'entrée du menu tient ce rôle. */
	.chip-add {
		background: none;
		border: 1px dashed var(--color-border);
		color: var(--color-text-muted);
		font-weight: 400;
	}

	.chip-add:hover { border-color: var(--color-accent); color: var(--color-accent); }

	/* ─── Menu de la prise ─────────────────────────────── */

	/* Le menu répond au manque de place, pas à un besoin de simplifier : au-dessus de
	   640 px toutes les commandes tiennent sur la ligne et s'y montrent, et le menu
	   disparaît. Les deux jeux coexistent dans le DOM ; `display: none` retire aussi
	   de l'arbre d'accessibilité, donc rien n'est annoncé deux fois.

	   Le menu n'est pas une commande de plus, c'est l'accès au reste : pas de cadre,
	   et posé au bord de la carte plutôt qu'aligné avec les boutons. La marge négative
	   reprend une partie du retrait de la carte — la cible, elle, ne bouge pas. */
	.row-menu {
		position: relative;
		display: none;
		margin-left: 0.15rem;
		margin-right: -0.4rem;
	}

	.row-menu-button { color: var(--color-text-muted); }

	.row-menu-button:hover:not(:disabled) { color: var(--color-text); }

	/* Ouvert, le bouton se tient : sans cadre au repos, rien ne dirait d'où sort le panneau. */
	.row-menu-button[aria-expanded='true'] {
		background: var(--color-bg-muted);
		color: var(--color-text);
	}

	.row-menu-panel {
		position: absolute;
		top: calc(100% + 6px);
		right: 0;
		z-index: 40;
		min-width: 14rem;
		display: flex;
		flex-direction: column;
		padding: 0.25rem;
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-modal);
	}

	/* La classe voyage jusqu'au bouton playlist par `buttonClass` : elle traverse une
	   frontière de composant, que la portée de Svelte ne suit pas. */
	:global(.row-menu-item) {
		width: 100%;
		justify-content: flex-start;
		gap: 0.5rem;
		border-color: transparent;
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		white-space: nowrap;
	}

	@media (max-width: 640px) {
		/* Les pastilles sont des commandes, pas seulement des décorations : elles
		   gardent donc une cible confortable à toucher. */
		.chip, .btn-mini { min-width: 44px; min-height: 44px; }
		.row-actions :global(.btn) { min-height: 44px; }

		.chip { font-size: var(--text-sm); }
		.btn-mini { font-size: 0.9rem; }

		/* Une entrée de menu se touche : la cible prime sur la compacité. */
		:global(.row-menu-item) { min-height: 44px; }

		/* `.row-wide-only` voyage jusqu'au bouton playlist par `buttonClass`, hors de la
		   portée de Svelte — d'où `:global`. Le passer sous `.row-actions` lui donne la
		   spécificité qu'il faut pour battre le `display` que portent `.chip` et `.btn` :
		   la classe de portée que Svelte ajoute compte comme une classe de plus. */
		.row-actions :global(.row-wide-only) { display: none; }
		.row-menu { display: inline-flex; }
		.drawer-action { min-height: 44px; }
	}

	.row-meta {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		min-width: 0;
		font-size: var(--text-xs);
		color: var(--color-text-muted);
	}

	.uploader { flex-shrink: 0; }

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

	.row-note { grid-area: note; margin-top: 0.2rem; min-width: 0; }

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

	.note-toggle :global(.note-icon) { color: var(--color-text-muted); }

	.note-text {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.row-note.open .note-text { white-space: pre-wrap; overflow: visible; }

	/* Les commentaires d'une prise ne sont pas d'autres prises. Empilés sous la ligne
	   avec le même cadre, le même rayon et le même fond, ils s'en réclamaient pourtant.
	   Le tiroir devient donc un fond creusé, rejoignant les bords de la carte par des
	   marges négatives qui reprennent son retrait : les commentaires s'y posent en
	   clair, et la hiérarchie se lit sans avoir à compter les bordures.

	   `--color-bg-subtle` est le fond de surface de la charte, celui de `.form-section`
	   et des panneaux de l'agenda. Surtout pas `--color-bg-muted`, qui est le jeton
	   d'interaction (`.btn-secondary:hover`) : le bouton posé dans ce tiroir en est un,
	   et son survol s'y serait confondu avec le fond. */
	.row-drawer {
		margin: 0.5rem -0.6rem -0.4rem -0.3rem;
		padding: 0.55rem 0.7rem 0.7rem;
		background: var(--color-bg-subtle);
		border-top: 1px solid var(--color-border-light);
		border-radius: 0 0 var(--radius-lg) var(--radius-lg);
	}

	/* Ce qui clôt un tiroir est une action, pas une note de bas de page : sous une liste
	   de commentaires, commenter est la suite naturelle et doit se voir comme telle. */
	.drawer-action { margin-top: 0.5rem; }
</style>
