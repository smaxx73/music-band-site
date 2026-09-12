<script lang="ts">
	// Participants d'une session : une vignette par nom, retirable d'un clic.
	// Les membres du groupe sont proposés, mais la saisie reste libre — un remplaçant
	// ou un invité d'un soir n'a pas de compte sur l'application.
	let {
		members = $bindable<string[]>([]),
		suggestions = [],
		disabled = false
	}: {
		members: string[]
		suggestions?: string[]
		disabled?: boolean
	} = $props()

	let draft = $state('')

	const absent = $derived(suggestions.filter((name) => !has(name)))

	function has(name: string): boolean {
		const key = name.trim().toLowerCase()
		return members.some((member) => member.toLowerCase() === key)
	}

	/** Accepte aussi un collage « Marc, Julie » : les virgules séparent toujours des noms. */
	function add(raw: string) {
		const added = raw
			.split(',')
			.map((name) => name.trim())
			.filter((name) => name && !has(name))
		if (added.length) members = [...members, ...added]
	}

	function remove(name: string) {
		members = members.filter((member) => member !== name)
	}

	function commitDraft() {
		add(draft)
		draft = ''
	}

	function onKeydown(event: KeyboardEvent) {
		// Entrée valide le nom en cours sans soumettre le formulaire qui entoure le champ.
		if (event.key === 'Enter' || event.key === ',') {
			event.preventDefault()
			commitDraft()
		} else if (event.key === 'Backspace' && !draft && members.length) {
			remove(members[members.length - 1])
		}
	}
</script>

<div class="members-input" class:disabled>
	{#if members.length}
		<ul class="chips">
			{#each members as member (member)}
				<li class="chip">
					<span>{member}</span>
					<button
						type="button"
						class="chip-remove"
						aria-label="Retirer {member}"
						onclick={() => remove(member)}
						{disabled}
					>×</button>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="empty">Personne pour l'instant.</p>
	{/if}

	<div class="add-row">
		<input
			class="form-input"
			type="text"
			placeholder="Ajouter un nom…"
			bind:value={draft}
			onkeydown={onKeydown}
			onblur={commitDraft}
			{disabled}
		/>
		<button type="button" class="btn btn-ghost" onclick={commitDraft} disabled={disabled || !draft.trim()}>
			Ajouter
		</button>
	</div>

	{#if absent.length}
		<div class="suggestions">
			{#each absent as name (name)}
				<button type="button" class="chip chip-add" onclick={() => add(name)} {disabled}>
					+ {name}
				</button>
			{/each}
			{#if absent.length > 1}
				<button type="button" class="all" onclick={() => add(absent.join(','))} {disabled}>
					Tout le groupe
				</button>
			{/if}
		</div>
	{/if}
</div>

<style>
	.members-input {
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
		border-radius: 999px;
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

	.chip-remove:hover:not(:disabled) {
		background: var(--color-border-light);
		color: var(--color-text);
	}

	.empty {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--color-text-muted);
	}

	.add-row {
		display: flex;
		gap: 0.4rem;
	}

	.add-row .form-input { flex: 1; }

	.add-row .btn { white-space: nowrap; }

	.suggestions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}

	.chip-add {
		padding: 0.15rem 0.65rem;
		background: none;
		font-family: inherit;
		cursor: pointer;
	}

	.chip-add:hover:not(:disabled) { background: var(--color-bg-muted); }

	.all {
		background: none;
		border: none;
		padding: 0.15rem 0.2rem;
		font-family: inherit;
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		text-decoration: underline;
		cursor: pointer;
	}

	.all:hover:not(:disabled) { color: var(--color-text); }

	button:disabled { cursor: default; opacity: 0.6; }
</style>
