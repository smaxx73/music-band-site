<script lang="ts">
	import AddToPlaylistButton from '$lib/components/AddToPlaylistButton.svelte'
	import RecordingComments from '$lib/components/RecordingComments.svelte'
	import RecordingPlaybackActions from '$lib/components/RecordingPlaybackActions.svelte'
	import ShareLinkDialog from '$lib/components/ShareLinkDialog.svelte'
	import ShareMenu from '$lib/components/ShareMenu.svelte'
	import Icon from '$lib/components/Icon.svelte'
	import Menu from '$lib/components/Menu.svelte'
	import TrackLead from '$lib/components/TrackLead.svelte'
	import TrackRow from '$lib/components/TrackRow.svelte'
	import { qualityClass } from '$lib/quality'
	import { player } from '$lib/player.svelte'
	import { formatTimecode } from '$lib/youtube'
	import { copyText, groupRecordingLink, publicLinksLabel } from '$lib/share-client'
	import { tick } from 'svelte'
	import type { RecordingListItem } from '$lib/types'

	let {
		recording,
		songId,
		songTitle,
		sessionDate,
		allowPublicShare = false,
		editableQuality = false,
		editMode = false,
		canDelete = false,
		deleting = false,
		onQualityChange = null,
		onDelete = null,
		session = null
	}: {
		recording: RecordingListItem
		songId: number
		songTitle: string
		sessionDate: string
		allowPublicShare?: boolean
		/** La qualité ne se règle que dans la vue session ; ailleurs, simple badge. */
		editableQuality?: boolean
		editMode?: boolean
		canDelete?: boolean
		deleting?: boolean
		/** Prévient la page pour qu'elle mette sa copie locale à jour. */
		onQualityChange?: ((status: string) => void) | null
		onDelete?: (() => void) | null
		/**
		 * Vue morceau : la prise se situe par sa session, qui devient son titre (en lien),
		 * comme une piste de playlist se titre par son morceau. Sans elle, vue session :
		 * le morceau est l'en-tête, la ligne s'appelle « Prise n ».
		 */
		session?: { id: number; label: string; location: string | null } | null
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
	// Partager depuis la prise qu'on écoute reprend sa position, comme sur sa page.
	const shareTime = $derived(isCurrent && player.currentTime > 1 ? Math.floor(player.currentTime) : null)
	// Le nombre de liens publics se voit de tous les membres ; seul le droit de partager
	// (et une piste audio) ouvre leur gestion.
	let shareCount = $derived(recording.share_count)
	const canSharePublic = $derived(allowPublicShare && hasAudio)
	let shareOpen = $state(false)

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

	function openPlaylist() {
		menuOpen = false
		playlistOpen = true
	}

	// Copie depuis le menu ⋮ (téléphone) : l'entrée confirme, puis le menu se referme.
	// Refusée, le lien s'affiche dans le menu pour être copié à la main.
	let menuLinkCopied = $state(false)
	let menuFailedUrl = $state<string | null>(null)

	$effect(() => {
		if (menuOpen) return
		menuLinkCopied = false
		menuFailedUrl = null
	})

	async function copyGroupLinkFromMenu() {
		const url = groupRecordingLink(recording.id, shareTime)
		if (await copyText(url)) {
			menuLinkCopied = true
			setTimeout(() => (menuOpen = false), 1200)
		} else {
			menuFailedUrl = url
		}
	}

	function openPublicShare() {
		menuOpen = false
		shareOpen = true
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

{#snippet lead()}
	<TrackLead
		number={recording.take}
		current={isCurrent}
		playing={isPlaying}
		playLabel="Écouter la prise {recording.take}"
		onToggle={hasAudio ? togglePlayback : null}
	/>
{/snippet}

<!-- Le numéro de la colonne de tête s'efface au survol et pendant la lecture : le titre
     le porte donc aussi, ou la session qui situe la prise en vue morceau. -->
{#snippet title()}
	{#if hasVideo}<Icon name="video" size="0.85rem" label="Prise vidéo" />{/if}
	{#if session}
		<a class="title-link" href="/sessions/{session.id}">{session.label}</a>
	{:else}
		Prise {recording.take}
	{/if}
{/snippet}

{#snippet meta()}
	{#if session}
		<!-- Le nom du fichier se lit en vue session ; ici, il vaut son infobulle. -->
		<span title={sourceTitle}>
			Prise {recording.take}{#if session.location} · {session.location}{/if} · {recording.uploaded_by}
		</span>
	{:else}
		<span
			class="file-name"
			class:fallback={!!recording.file_path && !recording.source_file_name}
			title={sourceTitle}
		>{sourceName}</span>
		· {recording.uploaded_by}
	{/if}
{/snippet}

{#snippet tags()}
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
		<!-- Une prise écoutable au dehors ne doit pas l'être à l'insu des autres : la
		     pastille se voit de tous, à toutes les largeurs, mais seulement s'il y a un lien. -->
		{#if shareCount > 0}
			{#if canSharePublic}
				<button
					class="chip chip-public"
					onclick={() => (shareOpen = true)}
					title="{publicLinksLabel(shareCount)} — gérer"
					aria-label="{publicLinksLabel(shareCount)} — gérer"
				><Icon name="globe" size="0.85rem" /> {shareCount}</button>
			{:else}
				<span class="chip chip-public" title={publicLinksLabel(shareCount)}>
					<Icon name="globe" size="0.85rem" label={publicLinksLabel(shareCount)} /> {shareCount}
				</span>
			{/if}
		{/if}
	</div>
{/snippet}

{#snippet actions()}
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

		<!-- `.row-quiet` sur le bouton seul, comme pour la playlist : sur le conteneur,
		     l'opacité emporterait aussi le panneau ouvert. -->
		<ShareMenu
			class="row-wide-only"
			buttonClass="btn btn-ghost btn-sm row-quiet"
			recordingId={recording.id}
			time={shareTime}
			downloadUrl={hasAudio ? `/audio/${recording.id}.mp3?download` : null}
			{canSharePublic}
			{shareCount}
			showCount={false}
			onOpenPublic={() => (shareOpen = true)}
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

		{#if editMode && canDelete}
			<button class="btn btn-danger btn-sm" disabled={deleting} onclick={() => onDelete?.()}>
				{deleting ? '…' : 'Supprimer'}
			</button>
		{/if}

		<div class="row-menu">
			<Menu bind:open={menuOpen}>
				{#snippet trigger(menu)}
					<button
						{...menu}
						class="btn btn-ghost btn-sm btn-icon row-menu-button"
						title="Autres actions"
						aria-label="Autres actions sur la prise {recording.take}"
					>
						<Icon name="more" />
					</button>
				{/snippet}

				{#if recording.file_path}
					<!-- Sans piste audio, « Voir » mène déjà à la page de la prise. -->
					<a href="/recording/{recording.id}" class="menu-item" role="menuitem">
						Ouvrir le lecteur complet
					</a>
					<button class="menu-item" role="menuitem" onclick={openPlaylist}>
						Ajouter à une playlist
					</button>
				{/if}
				<a href="/recording/{recording.id}#notes" class="menu-item" role="menuitem">
					{recording.notes ? 'Modifier la note' : 'Ajouter une note'}
				</a>
				<a href="/recording/{recording.id}#commenter" class="menu-item" role="menuitem">
					Ajouter un commentaire
				</a>
				<button class="menu-item" role="menuitem" onclick={copyGroupLinkFromMenu}>
					{#if menuLinkCopied}<Icon name="check" /> Lien copié
					{:else}Copier le lien pour le groupe{#if shareTime !== null}&nbsp;({formatTimecode(shareTime)}){/if}
					{/if}
				</button>
				{#if menuFailedUrl}
					<input
						class="form-input row-menu-url"
						type="text"
						readonly
						value={menuFailedUrl}
						aria-label="Lien pour le groupe, à copier"
						onfocus={(e) => e.currentTarget.select()}
					/>
				{/if}
				{#if canSharePublic}
					<button class="menu-item" role="menuitem" onclick={openPublicShare}>
						Lien d'écoute public…
					</button>
				{/if}
			</Menu>
		</div>
	</div>
{/snippet}

{#snippet aside()}{formatDuration(recording.duration_s)}{/snippet}

{#snippet note()}
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
{/snippet}

{#snippet drawer()}
	<RecordingComments recordingId={recording.id} onSeek={null} />
	<a href="/recording/{recording.id}#commenter" class="btn btn-secondary btn-sm drawer-action">
		<Icon name="comment" size="0.85rem" /> Commenter dans le lecteur
	</a>
{/snippet}

<TrackRow
	current={isCurrent}
	{hasAudio}
	expanded={commentsOpen}
	{lead}
	{title}
	{meta}
	{tags}
	{actions}
	{aside}
	below={recording.notes ? note : undefined}
	after={commentsOpen ? drawer : undefined}
/>

{#if shareOpen}
	<ShareLinkDialog
		target={{ kind: 'recording', id: recording.id }}
		onClose={() => (shareOpen = false)}
		onCountChange={(count) => (shareCount = count)}
	/>
{/if}

<style>
	/* La grille, le repli, le survol et l'état « en cours » sont ceux de `TrackRow`,
	   communs à toutes les pistes. Il ne reste ici que ce qui est propre à une prise :
	   qualité, pastilles, menu ⋮, note. */
	.title-link {
		color: inherit;
		text-decoration: none;
	}

	.title-link:hover { text-decoration: underline; }

	.row-tags {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.3rem 0.4rem;
	}

	.row-actions {
		display: flex;
		align-items: center;
		flex-wrap: nowrap;
		gap: 0.2rem;
	}

	.row-play { display: inline-flex; }

	/* Lien public actif : teinté, pour qu'on le remarque parmi les pastilles à lire. */
	.chip-public { background: var(--color-accent-light); color: var(--color-accent); }
	span.chip-public { cursor: default; }
	span.chip-public:hover { border-color: transparent; }

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
		font-size: var(--text-xs);
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
		font-size: var(--text-xs);
		font-family: inherit;
		cursor: pointer;
	}

	.btn-mini-ghost {
		background: none;
		border: 1px solid var(--color-border-input);
		color: var(--color-text-muted);
	}

	.btn-mini:disabled { opacity: var(--disabled-opacity); cursor: not-allowed; }

	.row-error { font-size: var(--text-xs); color: var(--color-error); }

	/* Note et commentaires partagent la même grammaire : une pastille ne paraît que
	   s'il y a quelque chose à lire, et elle le déplie sur place. Écrire le premier
	   commentaire ou la première note se fait depuis le menu, comme tout ce qui
	   demande d'ouvrir le lecteur. */
	.chip {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: var(--color-chip-bg);
		color: var(--color-text);
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

	.row-menu-url { margin: 0.1rem 0.25rem 0.3rem; width: auto; min-width: 0; font-size: var(--text-xs); }

	@media (max-width: 640px) {
		/* Les pastilles sont des commandes, pas seulement des décorations : elles
		   gardent donc une cible confortable à toucher. */
		.chip, .btn-mini { min-width: 44px; min-height: 44px; }
		.row-actions :global(.btn) { min-height: 44px; }

		.chip { font-size: var(--text-sm); }
		.btn-mini { font-size: var(--text-sm); }

		/* `.row-wide-only` voyage jusqu'au bouton playlist par `buttonClass`, hors de la
		   portée de Svelte — d'où `:global`. Le passer sous `.row-actions` lui donne la
		   spécificité qu'il faut pour battre le `display` que portent `.chip` et `.btn` :
		   la classe de portée que Svelte ajoute compte comme une classe de plus. */
		.row-actions :global(.row-wide-only) { display: none; }
		.row-menu { display: inline-flex; }
		.drawer-action { min-height: 44px; }
	}

	.file-name { color: var(--color-text-secondary); }
	.file-name.fallback { color: var(--color-text-muted); font-style: italic; }

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

	/* Ce qui clôt un tiroir est une action, pas une note de bas de page : sous une liste
	   de commentaires, commenter est la suite naturelle et doit se voir comme telle. */
	.drawer-action { margin-top: 0.5rem; }
</style>
