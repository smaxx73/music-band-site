<script lang="ts" generics="T">
	import type { Snippet } from 'svelte'

	// Champ texte libre avec une liste de suggestions (motif « combobox » de l'ARIA) : la
	// saisie reste libre, une suggestion ne fait que la compléter. Le parent filtre et
	// fournit les suggestions ; ce composant gère l'ouverture, le clavier et l'annonce.
	let {
		id,
		value = $bindable(''),
		items,
		key,
		item,
		status = null,
		placeholder = '',
		disabled = false,
		onInput,
		onPick,
		onFocus
	}: {
		id: string
		value?: string
		items: T[]
		key: (item: T) => string
		/** Rendu d'une suggestion. */
		item: Snippet<[T]>
		/** Ligne d'état sous la saisie quand il n'y a rien à proposer (« Recherche… »). */
		status?: string | null
		placeholder?: string
		disabled?: boolean
		onInput?: (value: string) => void
		onPick: (item: T) => void
		onFocus?: () => void
	} = $props()

	let open = $state(false)
	let active = $state(-1)

	const listId = $derived(`${id}-list`)
	const expanded = $derived(open && (items.length > 0 || !!status))

	function input(event: Event) {
		value = (event.currentTarget as HTMLInputElement).value
		open = true
		active = -1
		onInput?.(value)
	}

	function pick(choice: T) {
		open = false
		active = -1
		onPick(choice)
	}

	function keydown(event: KeyboardEvent) {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			if (!items.length) return
			event.preventDefault()
			open = true
			const step = event.key === 'ArrowDown' ? 1 : -1
			active = (active + step + items.length) % items.length
		} else if (event.key === 'Enter' && expanded && active >= 0) {
			// Entrée choisit la suggestion en surbrillance plutôt que d'envoyer le formulaire.
			event.preventDefault()
			pick(items[active])
		} else if (event.key === 'Escape' && expanded) {
			// Échap ferme la liste sans fermer la fenêtre qui porte le formulaire.
			event.stopPropagation()
			open = false
			active = -1
		}
	}
</script>

<div class="suggest">
	<input
		{id}
		class="form-input"
		type="text"
		role="combobox"
		autocomplete="off"
		aria-autocomplete="list"
		aria-expanded={expanded}
		aria-controls={listId}
		aria-activedescendant={expanded && active >= 0 ? `${id}-${active}` : undefined}
		{value}
		{placeholder}
		{disabled}
		oninput={input}
		onkeydown={keydown}
		onfocus={() => {
			open = true
			onFocus?.()
		}}
		onblur={() => {
			open = false
			active = -1
		}}
	/>
	<ul id={listId} class="suggest-list" role="listbox" hidden={!expanded}>
		{#each items as choice, i (key(choice))}
			<!-- mousedown retenu : le champ garderait sinon le focus perdu avant le clic.
			     Le clavier passe par le champ (flèches, Entrée) : c'est le motif combobox,
			     les options ne prennent jamais le focus. -->
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<li
				id="{id}-{i}"
				role="option"
				aria-selected={i === active}
				class:active={i === active}
				onmousedown={(event) => event.preventDefault()}
				onclick={() => pick(choice)}
			>
				{@render item(choice)}
			</li>
		{/each}
		{#if !items.length && status}
			<li class="suggest-status" role="presentation">{status}</li>
		{/if}
	</ul>
</div>

<style>
	.suggest { position: relative; }

	.suggest-list {
		position: absolute;
		z-index: 20;
		top: calc(100% + 2px);
		left: 0;
		right: 0;
		max-height: 16rem;
		overflow-y: auto;
		margin: 0;
		padding: 0.25rem;
		list-style: none;
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		box-shadow: 0 6px 18px rgba(44, 43, 40, 0.14);
	}

	.suggest-list[hidden] { display: none; }

	li[role='option'] {
		padding: 0.4rem 0.55rem;
		border-radius: var(--radius-sm);
		cursor: pointer;
		font-size: var(--text-sm);
		line-height: 1.3;
	}

	li[role='option']:hover,
	li.active { background: var(--color-bg-subtle); }

	.suggest-status {
		padding: 0.4rem 0.55rem;
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}
</style>
