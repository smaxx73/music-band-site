<script lang="ts">
	import { untrack } from 'svelte'
	import SuggestInput from '$lib/components/SuggestInput.svelte'
	import { AddressSearch } from '$lib/address-search.svelte'
	import type { PlaceAddress } from '$lib/places'

	// Adresse d'un lieu du groupe, dans un formulaire de /group : proposée par la Base
	// Adresse Nationale, ou saisie librement (hors de France, adresse inconnue) — sans
	// coordonnées alors, donc sans carte. Envoyée par trois champs cachés : `address`,
	// `lat`, `lon`.
	let {
		initial = null,
		disabled = false
	}: {
		initial?: PlaceAddress | null
		disabled?: boolean
	} = $props()

	const uid = Math.random().toString(36).slice(2, 8)
	const search = new AddressSearch()

	let text = $state(untrack(() => initial?.label ?? ''))
	let lat = $state<number | null>(untrack(() => initial?.lat ?? null))
	let lon = $state<number | null>(untrack(() => initial?.lon ?? null))

	function onInput(value: string) {
		// Retaper l'adresse défait celle qu'on avait choisie : ses coordonnées ne la
		// décrivent plus.
		lat = null
		lon = null
		search.query(value)
	}

	function pick(address: PlaceAddress) {
		search.clear()
		text = address.label
		lat = address.lat
		lon = address.lon
	}
</script>

<div class="form-label">
	<label for="address-{uid}">Adresse <span class="optional">(optionnel)</span></label>
	<SuggestInput
		id="address-{uid}"
		bind:value={text}
		items={search.results}
		key={(a) => a.label}
		status={search.status}
		placeholder="Numéro, rue, ville…"
		{disabled}
		{onInput}
		onPick={pick}
	>
		{#snippet item(address)}{address.label}{/snippet}
	</SuggestInput>
	<input type="hidden" name="address" value={text} />
	<input type="hidden" name="lat" value={lat ?? ''} />
	<input type="hidden" name="lon" value={lon ?? ''} />
	{#if text.trim()}
		<p class="kind">
			{lat !== null ? 'Adresse reconnue : le lieu aura un lien vers la carte.' : 'Adresse gardée telle que saisie, sans carte.'}
		</p>
	{/if}
</div>

<style>
	.optional {
		font-weight: 400;
		color: var(--color-text-muted);
		font-size: var(--text-xs);
	}

	.kind {
		margin: 0;
		font-size: var(--text-xs);
		font-weight: 400;
		color: var(--color-text-muted);
	}
</style>
