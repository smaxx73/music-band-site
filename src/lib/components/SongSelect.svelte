<script lang="ts" generics="T extends { id: number; title: string }">
	import { tick } from 'svelte'
	import { createSong, placeholderSongTitle, type CreatedSong } from '$lib/songs'

	/**
	 * Sélecteur de morceau qui sait aussi en créer un, sans quitter l'écran : l'enregistrement
	 * qu'on classe ne correspond pas toujours à un morceau du référentiel, et partir dans
	 * /songs au milieu d'un envoi fait perdre le fil. Le titre arrive prérempli d'un
	 * « À nommer — … » : pressé, on valide tel quel et on renomme depuis la prise.
	 */
	let {
		songs,
		value = $bindable(''),
		oncreate,
		label = '',
		ariaLabel = 'Morceau',
		emptyLabel = '— Choisir —',
		placeholderAt = null,
		required = false,
		disabled = false,
		class: className = ''
	}: {
		songs: T[]
		value?: string
		/** Le morceau créé (ou retrouvé) : au parent de l'ajouter à sa liste. */
		oncreate: (song: CreatedSong) => void
		label?: string
		ariaLabel?: string
		emptyLabel?: string
		/** Moment daté dans le titre provisoire ; l'heure de l'ouverture par défaut. */
		placeholderAt?: Date | null
		required?: boolean
		disabled?: boolean
		class?: string
	} = $props()

	// Valeur d'option qu'aucun id ne peut prendre.
	const NEW = '__new__'

	let draft = $state<string | null>(null)
	let saving = $state(false)
	let error = $state<string | null>(null)
	let input = $state<HTMLInputElement | null>(null)

	async function openCreate() {
		error = null
		draft = placeholderSongTitle(placeholderAt ?? new Date(), songs.map((s) => s.title))
		await tick()
		// Tout sélectionné : taper remplace le titre provisoire, Entrée le garde.
		input?.focus()
		input?.select()
	}

	function cancel() {
		draft = null
		error = null
	}

	async function create() {
		const title = draft?.trim()
		if (!title || saving) return
		// Déjà dans la liste, à la casse près : on le choisit, sans aller-retour serveur.
		const known = songs.find((s) => s.title.toLocaleLowerCase('fr') === title.toLocaleLowerCase('fr'))
		if (known) {
			value = String(known.id)
			draft = null
			return
		}
		saving = true
		error = null
		const result = await createSong(title)
		saving = false
		if (!result.ok) { error = result.error; return }
		oncreate(result.song)
		value = String(result.song.id)
		draft = null
	}

	function onchange(e: Event & { currentTarget: HTMLSelectElement }) {
		if (e.currentTarget.value === NEW) {
			// Le sélecteur garde la valeur courante tant que rien n'est créé.
			e.currentTarget.value = value
			openCreate()
		} else {
			value = e.currentTarget.value
		}
	}
</script>

{#snippet select()}
	<select
		class="form-input"
		value={value}
		{onchange}
		{required}
		disabled={disabled || draft !== null}
		aria-label={label ? undefined : ariaLabel}
	>
		<option value="" disabled={required}>{emptyLabel}</option>
		<option value={NEW}>+ Nouveau morceau…</option>
		{#if songs.length > 0}
			<optgroup label="Référentiel">
				{#each songs as s (s.id)}
					<option value={String(s.id)}>{s.title}</option>
				{/each}
			</optgroup>
		{/if}
	</select>
{/snippet}

<div class="song-select {className}">
	{#if label}
		<label class="form-label">
			{label}
			{@render select()}
		</label>
	{:else}
		{@render select()}
	{/if}

	{#if draft !== null}
		<div class="new-song">
			<div class="new-row">
				<input
					class="form-input"
					type="text"
					bind:value={draft}
					bind:this={input}
					maxlength="200"
					aria-label="Titre du nouveau morceau"
					disabled={saving}
					onkeydown={(e) => {
						// Entrée crée le morceau, sans soumettre le formulaire qui l'entoure.
						if (e.key === 'Enter') { e.preventDefault(); create() }
						else if (e.key === 'Escape') { e.preventDefault(); cancel() }
					}}
				/>
				<button type="button" class="btn btn-primary btn-sm" onclick={create} disabled={saving || !draft.trim()}>
					{saving ? 'Création…' : 'Créer'}
				</button>
				<button type="button" class="btn btn-ghost btn-sm" onclick={cancel} disabled={saving}>Annuler</button>
			</div>
			<p class="hint">
				Pressé ? Garde ce titre provisoire : le morceau se renomme ensuite depuis la page de la prise.
			</p>
			{#if error}<p class="message-error">{error}</p>{/if}
		</div>
	{/if}
</div>

<style>
	.song-select { display: flex; flex-direction: column; gap: 0.4rem; min-width: 0; }

	.new-song {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		padding: 0.5rem;
		background: var(--color-bg-subtle);
		border: 1px solid var(--color-border-light);
		border-radius: var(--radius-md);
	}

	.new-row { display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap; }
	.new-row input { flex: 1 1 12rem; min-width: 0; }

	.hint { margin: 0; font-size: var(--text-xs); color: var(--color-text-muted); }
	.message-error { margin: 0; }
</style>
