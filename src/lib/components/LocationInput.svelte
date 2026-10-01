<script lang="ts">
	import { onMount } from 'svelte'
	import SuggestInput from '$lib/components/SuggestInput.svelte'
	import { AddressSearch } from '$lib/address-search.svelte'
	import {
		addressCoords,
		findPlace,
		placeKey,
		placeSearchKey,
		type Coords,
		type GroupPlace,
		type PlaceAddress
	} from '$lib/places'

	// Lieu d'une session ou d'un événement. Un seul champ, qui propose deux choses :
	//   - les LIEUX DU GROUPE (étiquette et adresse, gérés depuis /group) ;
	//   - une ADRESSE réelle, cherchée dans la Base Adresse Nationale dès 3 caractères.
	// Un lieu du groupe donne son étiquette, dont l'adresse se relit en base ; une adresse
	// donne son libellé et ses coordonnées, gardées avec la session pour la carte. Ce qui
	// n'est ni l'un ni l'autre reste un texte, sans adresse.
	let {
		value = $bindable(''),
		coords = $bindable(null),
		place = $bindable(null),
		optional = false,
		hideLabel = false,
		placeholder = 'Lieu du groupe ou adresse…',
		disabled = false
	}: {
		/** Le texte du lieu, ce qui s'affiche partout (`location`). */
		value?: string
		/** Coordonnées d'une adresse choisie ; `null` pour un lieu du groupe ou un texte libre. */
		coords?: Coords | null
		/** Le lieu du groupe que désigne `value`, pour l'aperçu. Lecture seule. */
		place?: GroupPlace | null
		optional?: boolean
		/** Libellé gardé pour les lecteurs d'écran seulement (formulaire sans libellés). */
		hideLabel?: boolean
		placeholder?: string
		disabled?: boolean
	} = $props()

	const uid = Math.random().toString(36).slice(2, 8)

	type Choice =
		| { kind: 'place'; key: string; place: GroupPlace; heading: string | null }
		| { kind: 'address'; key: string; address: PlaceAddress; heading: string | null }

	// ─── Lieux du groupe ───

	let places = $state<GroupPlace[]>([])
	let placesRequested = false

	// Chargés au premier focus : la plupart des formulaires s'ouvrent sans qu'on touche au
	// lieu. Tout de suite si un lieu est déjà saisi, pour dire ce qu'il est.
	async function loadPlaces() {
		if (placesRequested) return
		placesRequested = true
		try {
			const res = await fetch('/api/places')
			if (!res.ok) return
			places = ((await res.json()) as { places: GroupPlace[] }).places
			place = findPlace(places, value)
		} catch {
			// Sans la liste, le champ reste un champ libre : rien à signaler de plus.
		}
	}

	onMount(() => {
		if (value.trim()) loadPlaces()
	})

	const placeMatches = $derived.by(() => {
		const typed = placeSearchKey(value)
		const matching = typed
			? places.filter(
					(p) =>
						placeKey(p.label) !== placeKey(value) &&
						(placeSearchKey(p.label).includes(typed) ||
							(p.address !== null && placeSearchKey(p.address.label).includes(typed)))
				)
			: places
		return matching.slice(0, 6)
	})

	// ─── Adresses de la Base Adresse Nationale ───

	const search = new AddressSearch()

	// ─── Saisie et choix ───

	const choices = $derived<Choice[]>([
		...placeMatches.map((p, i) => ({
			kind: 'place' as const,
			key: `p${p.id}`,
			place: p,
			heading: i === 0 ? 'Lieux du groupe' : null
		})),
		...search.results.map((a, i) => ({
			kind: 'address' as const,
			key: `a${a.label}`,
			address: a,
			heading: i === 0 ? 'Adresses' : null
		}))
	])

	function onInput(text: string) {
		// Retaper le lieu défait l'adresse choisie : ses coordonnées ne le décrivent plus.
		coords = null
		place = findPlace(places, text)
		// Un lieu du groupe tapé en entier n'a pas besoin d'adresse de plus.
		if (place) search.clear()
		else search.query(text)
	}

	function pick(choice: Choice) {
		search.clear()
		if (choice.kind === 'place') {
			value = choice.place.label
			coords = null
			place = choice.place
		} else {
			value = choice.address.label
			coords = addressCoords(choice.address)
			place = findPlace(places, choice.address.label)
		}
	}

</script>

<div class="form-label location">
	<label for="location-{uid}" class:sr-only={hideLabel}>
		Lieu {#if optional}<span class="optional">(optionnel)</span>{/if}
	</label>
	<SuggestInput
		id="location-{uid}"
		bind:value
		items={choices}
		key={(c) => c.key}
		status={search.status}
		placeholder={hideLabel && optional ? `${placeholder} (optionnel)` : placeholder}
		{disabled}
		onFocus={loadPlaces}
		{onInput}
		onPick={pick}
	>
		{#snippet item(choice)}
			{#if choice.heading}<span class="choice-heading">{choice.heading}</span>{/if}
			{#if choice.kind === 'place'}
				<span class="choice-label">{choice.place.label}</span>
				{#if choice.place.address}
					<span class="choice-detail">{choice.place.address.label}</span>
				{/if}
			{:else}
				<span class="choice-label">{choice.address.label}</span>
			{/if}
		{/snippet}
	</SuggestInput>

	<!-- Ce que le lieu saisi est devenu : c'est la différence entre les deux choix. -->
	{#if value.trim()}
		<p class="location-kind">
			{#if place}
				Lieu du groupe{#if place.address} · {place.address.label}{:else} · sans adresse{/if}
			{:else if coords}
				Adresse reconnue
			{:else}
				Ni un lieu du groupe ni une adresse reconnue : gardé tel quel. Les lieux du groupe se
				gèrent depuis la page Groupe.
			{/if}
		</p>
	{/if}
</div>

<style>
	.location { position: relative; }

	.optional {
		font-weight: 400;
		color: var(--color-text-muted);
		font-size: var(--text-xs);
	}

	/* Intertitre porté par la première suggestion de chaque groupe. */
	.choice-heading {
		display: block;
		margin: -0.1rem 0 0.3rem;
		font-size: var(--text-2xs);
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--color-text-muted);
	}

	.choice-label { display: block; }

	.choice-detail {
		display: block;
		font-size: var(--text-xs);
		color: var(--color-text-muted);
	}

	.location-kind {
		margin: 0;
		font-size: var(--text-xs);
		font-weight: 400;
		color: var(--color-text-muted);
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
</style>
