<script lang="ts">
	// Instruments joués dans un groupe : une vignette par instrument, retirable d'un clic.
	// La liste usuelle est proposée par le navigateur (`<datalist>`) sans être imposée.
	// Chaque vignette porte un champ caché `name` : le formulaire qui l'entoure les envoie
	// tels quels, et le serveur les normalise (`normalizeInstruments`).
	import { INSTRUMENT_SUGGESTIONS, MAX_INSTRUMENT_LENGTH, MAX_INSTRUMENTS, normalizeInstruments } from '$lib/instruments'

	let {
		instruments = $bindable<string[]>([]),
		name = 'instrument',
		label
	}: {
		instruments: string[]
		name?: string
		/** Nom accessible du champ de saisie (« Instruments dans The Lambda »). */
		label: string
	} = $props()

	const uid = $props.id()
	const listId = `instruments-${uid}`
	let draft = $state('')

	const full = $derived(instruments.length >= MAX_INSTRUMENTS)
	const absent = $derived(
		INSTRUMENT_SUGGESTIONS.filter((s) => !instruments.some((i) => i.toLocaleLowerCase('fr') === s.toLocaleLowerCase('fr')))
	)

	/** Accepte aussi un collage « Basse, Chœurs » : les virgules séparent toujours. */
	function add(raw: string) {
		const merged = normalizeInstruments([...instruments, ...raw.split(',')])
		// Au-delà des limites, la saisie reste dans le champ : rien ne disparaît en silence.
		if (!merged) return false
		instruments = merged
		return true
	}

	function remove(instrument: string) {
		instruments = instruments.filter((i) => i !== instrument)
	}

	function commitDraft() {
		if (!draft.trim()) return
		if (add(draft)) draft = ''
	}

	function onKeydown(event: KeyboardEvent) {
		// Entrée valide l'instrument en cours sans soumettre le formulaire qui entoure le champ.
		if (event.key === 'Enter' || event.key === ',') {
			event.preventDefault()
			commitDraft()
		} else if (event.key === 'Backspace' && !draft && instruments.length) {
			remove(instruments[instruments.length - 1])
		}
	}

	// Choisir une suggestion de la liste du navigateur ne déclenche pas de touche Entrée :
	// on la reconnaît à ce que le champ vaut exactement une entrée de la liste.
	function onInput() {
		if (INSTRUMENT_SUGGESTIONS.some((s) => s === draft)) commitDraft()
	}
</script>

<div class="instruments-input">
	{#each instruments as instrument (instrument)}
		<input type="hidden" {name} value={instrument} />
	{/each}

	{#if instruments.length}
		<ul class="chips">
			{#each instruments as instrument (instrument)}
				<li class="chip">
					<span>{instrument}</span>
					<button type="button" class="chip-remove" aria-label="Retirer {instrument}" onclick={() => remove(instrument)}>×</button>
				</li>
			{/each}
		</ul>
	{/if}

	<div class="add-row">
		<input
			class="form-input"
			type="text"
			list={listId}
			placeholder={full ? `${MAX_INSTRUMENTS} instruments au plus` : 'Ajouter un instrument…'}
			aria-label={label}
			maxlength={MAX_INSTRUMENT_LENGTH}
			bind:value={draft}
			onkeydown={onKeydown}
			oninput={onInput}
			onblur={commitDraft}
			disabled={full}
		/>
		<button type="button" class="btn btn-ghost" onclick={commitDraft} disabled={full || !draft.trim()}>
			Ajouter
		</button>
	</div>
	<datalist id={listId}>
		{#each absent as suggestion (suggestion)}
			<option value={suggestion}></option>
		{/each}
	</datalist>
</div>

<style>
	.instruments-input {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		font-weight: 400;
	}

	.chips {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		background: var(--color-bg-muted);
		border: 1px solid var(--color-border-light);
		border-radius: var(--radius-pill);
		padding: 0.15rem 0.35rem 0.15rem 0.65rem;
		font-size: var(--text-xs);
		color: var(--color-text);
	}

	.chip-remove {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.05rem;
		height: 1.05rem;
		border: none;
		border-radius: 50%;
		background: none;
		color: var(--color-text-muted);
		font-size: 0.85rem;
		line-height: 1;
		font-family: inherit;
		cursor: pointer;
	}

	.chip-remove:hover {
		background: var(--color-border-light);
		color: var(--color-text);
	}

	.add-row {
		display: flex;
		gap: 0.4rem;
	}

	.add-row .form-input { flex: 1; min-width: 0; }

	.add-row .btn { white-space: nowrap; }
</style>
