<script lang="ts">
	import CatalogSearch, { type CatalogTrack } from '$lib/components/CatalogSearch.svelte'
	import { untrack } from 'svelte'
	import { SONG_STATUS_LABELS } from '$lib/songs'

	/**
	 * Champs de la fiche d'un morceau, dans un <form> fourni par la page : modale d'ajout
	 * et tableau de /songs, édition sur la page du morceau. Le serveur les relit avec
	 * `parseSongForm` (`src/lib/server/songs.ts`).
	 */
	type SongFieldValues = {
		title: string
		composer: string | null
		key: string | null
		status: string
		original_artist: string | null
		release_year: number | null
		reference_duration_s: number | null
		tempo_bpm: number | null
		lyrics: string | null
		music_notes: string | null
	}

	let { song = null }: { song?: SongFieldValues | null } = $props()

	// Composition du groupe ou reprise : c'est ce qui dit quoi écrire où. Pas de colonne
	// en base — une reprise est un morceau qui a un artiste original (`original_artist`).
	// Une fiche neuve part d'une composition : c'est le cas sans champ obligatoire.
	let origin = $state<'composition' | 'reprise'>(untrack(() => song?.original_artist ? 'reprise' : 'composition'))

	// Un titre choisi dans le catalogue remplit la fiche qu'on est en train d'écrire. Les
	// champs restent modifiables : c'est une aide à la saisie, pas une source qui fait foi.
	// Le compositeur n'est pas repris — Deezer ne connaît que les interprètes. La recherche
	// n'est proposée que pour une reprise : une composition du groupe n'y est pas.
	function fillFromCatalog(track: CatalogTrack, root: HTMLElement) {
		const form = root.closest('form')
		if (!form) return
		const set = (name: string, value: string) => {
			const field = form.elements.namedItem(name)
			if (field instanceof HTMLInputElement) field.value = value
		}
		set('title', track.title)
		set('original_artist', track.artist)
		if (track.release_year) set('release_year', String(track.release_year))
		if (track.duration_s) set('reference_duration', formatDurationInput(track.duration_s))
	}

	// Préremplit le champ de durée en édition ("3:45"), au format attendu en retour du formulaire.
	function formatDurationInput(s: number | null | undefined) {
		if (!s && s !== 0) return ''
		const m = Math.floor(s / 60)
		const sec = s % 60
		return `${m}:${String(sec).padStart(2, '0')}`
	}
</script>

<div class="fields-create">
	<input type="hidden" name="origin" value={origin} />
	<div class="origin-choice" role="radiogroup" aria-label="Origine du morceau">
		<label class="check-label">
			<input type="radio" value="composition" bind:group={origin} />
			<span>Composition du groupe</span>
		</label>
		<label class="check-label">
			<input type="radio" value="reprise" bind:group={origin} />
			<span>Reprise</span>
		</label>
	</div>
	{#if origin === 'reprise'}
		<CatalogSearch
			name="deezer_track_id"
			initialQuery={song ? [song.title, song.original_artist].filter(Boolean).join(' ') : ''}
			onPick={fillFromCatalog}
		/>
	{/if}
	<label class="form-label">
		<span>Titre <span class="required">*</span></span>
		<input
			class="form-input"
			type="text"
			name="title"
			value={song?.title ?? ''}
			required
			autocomplete="off"
		/>
	</label>
	<!-- Les deux variantes restent dans le DOM : passer de l'une à l'autre ne perd pas la
	     saisie. Masquée, une variante est désactivée et n'est donc pas envoyée. -->
	<div class="fields-row fields-row-credit" hidden={origin !== 'reprise'}>
		<label class="form-label">
			<span>Artiste ou groupe original <span class="required">*</span></span>
			<input
				class="form-input"
				type="text"
				name="original_artist"
				value={song?.original_artist ?? ''}
				placeholder="ex : Stevie Wonder"
				required
				disabled={origin !== 'reprise'}
			/>
		</label>
		<label class="form-label">
			<span>Compositeur <span class="optional-hint">(si différent)</span></span>
			<input class="form-input" type="text" name="composer" value={song?.composer ?? ''} disabled={origin !== 'reprise'} />
		</label>
	</div>
	<label class="form-label" hidden={origin !== 'composition'}>
		<span>Écrit par <span class="optional-hint">(optionnel)</span></span>
		<input
			class="form-input"
			type="text"
			name="composer"
			value={song?.composer ?? ''}
			placeholder="les membres qui l'ont écrit — vide : tout le groupe"
			disabled={origin !== 'composition'}
		/>
	</label>
	<div class="fields-row">
		<label class="form-label tonalite">
			Tonalité
			<input
				class="form-input"
				type="text"
				name="key"
				value={song?.key ?? ''}
				placeholder="ex : Dm, Bb"
			/>
		</label>
		<label class="form-label statut">
			Statut
			<select class="form-input" name="status">
				{#each Object.entries(SONG_STATUS_LABELS) as [value, label]}
					<option {value} selected={song ? song.status === value : value === 'en_apprentissage'}>
						{label}
					</option>
				{/each}
			</select>
		</label>
		<label class="form-label annee">
			{origin === 'reprise' ? 'Année de sortie' : 'Année de composition'}
			<input
				class="form-input"
				type="text"
				inputmode="numeric"
				name="release_year"
				value={song?.release_year ?? ''}
				placeholder="AAAA"
				maxlength="4"
			/>
		</label>
		<label class="form-label duree">
			Durée de référence
			<input
				class="form-input"
				type="text"
				name="reference_duration"
				value={formatDurationInput(song?.reference_duration_s)}
				placeholder="mm:ss"
			/>
		</label>
		<!-- Donne le clic de la feuille de répétition. -->
		<label class="form-label tempo">
			Tempo (BPM)
			<input
				class="form-input"
				type="text"
				inputmode="numeric"
				name="tempo_bpm"
				value={song?.tempo_bpm ?? ''}
				placeholder="ex : 120"
				maxlength="3"
			/>
		</label>
	</div>
	<details class="optional-details" open={Boolean(song?.lyrics || song?.music_notes)}>
		<summary>Paroles et accords <span class="optional-hint">(optionnel)</span></summary>
		<div class="fields-optional">
			<label class="form-label">
				Paroles
				<textarea class="form-input" name="lyrics" rows="6" value={song?.lyrics ?? ''}></textarea>
			</label>
			<label class="form-label">
				Accords / infos musicales
				<textarea
					class="form-input"
					name="music_notes"
					rows="6"
					value={song?.music_notes ?? ''}
					placeholder="Accords, structure, tempo, remarques..."
				></textarea>
			</label>
		</div>
		<!-- Deux supports, sans synchronisation : la fiche reste le texte libre que
		     reprennent la prise et la playlist, la feuille en part à sa création. -->
		<p class="form-hint sheet-hint">
			Pour placer les accords au-dessus des paroles, découper en sections ou ajouter
			quelques mesures de partition : « Feuille de répétition », sur la page du morceau.
			À sa création, elle reprend ces deux champs.
		</p>
	</details>
</div>

<style>
	.fields-create {
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
	}

	.origin-choice { display: flex; flex-wrap: wrap; gap: 0 1.5rem; }

	.check-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: var(--text-sm);
		font-weight: 600;
		cursor: pointer;
	}

	.fields-row {
		display: grid;
		grid-template-columns: 110px 175px 130px 110px 100px;
		/* Un libellé sur deux lignes (« Durée de référence ») ne décale pas son champ. */
		align-items: end;
		gap: 0.65rem;
	}

	.fields-row .form-input { width: 100%; min-width: 0; box-sizing: border-box; }

	.fields-row-credit { grid-template-columns: 1fr 1fr; }

	[hidden] { display: none !important; }

	.optional-details {
		border: 1px solid var(--color-border-light);
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.optional-details summary {
		padding: 0.5rem 0.75rem;
		font-size: var(--text-sm);
		font-weight: 600;
		cursor: pointer;
		user-select: none;
		background: var(--color-bg-subtle);
		list-style: none;
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.optional-details summary::before {
		content: '▸';
		font-size: 0.7rem;
		transition: transform 0.15s;
	}

	.optional-details[open] summary::before {
		transform: rotate(90deg);
	}

	.optional-hint {
		font-weight: 400;
		color: var(--color-text-muted);
		font-size: var(--text-xs);
	}

	.sheet-hint { margin: 0; padding: 0 0.75rem 0.75rem; }

	.fields-optional {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.65rem;
		padding: 0.75rem;
	}

	textarea.form-input {
		resize: vertical;
		min-height: 7rem;
	}

	.required { color: var(--color-error); }

	@media (max-width: 640px) {
		.fields-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
		.fields-row-credit { grid-template-columns: 1fr; }

		.fields-optional { grid-template-columns: 1fr; }
	}
</style>
