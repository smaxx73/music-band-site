<script lang="ts">
	import { tick } from 'svelte'

	export type MentionMember = {
		id: number
		nickname: string
		display_name: string
	}

	let {
		members,
		value = $bindable(''),
		rows = 3,
		disabled = false,
		required = false,
		label = 'Commentaire'
	}: {
		members: MentionMember[]
		value?: string
		rows?: number
		disabled?: boolean
		required?: boolean
		label?: string
	} = $props()

	let textarea = $state<HTMLTextAreaElement | null>(null)
	let caret = $state(0)
	let selectedIndex = $state(0)
	let dismissed = $state(false)

	function mentionAtCaret() {
		const beforeCaret = value.slice(0, caret)
		// Le @ doit commencer un mot : une adresse e-mail ne déclenche pas la liste.
		const match = /(^|[\s([{])@([^\s@]*)$/.exec(beforeCaret)
		if (!match) return null

		return {
			start: caret - match[2].length - 1,
			query: match[2].toLocaleLowerCase('fr-FR')
		}
	}

	let activeMention = $derived(mentionAtCaret())
	let suggestions = $derived.by(() => {
		if (!activeMention || dismissed) return []
		const query = activeMention.query
		return members.filter((member) => {
			const nickname = member.nickname.toLocaleLowerCase('fr-FR')
			const name = member.display_name.toLocaleLowerCase('fr-FR')
			return !query || nickname.includes(query) || name.includes(query)
		})
	})

	export function focus() {
		textarea?.focus()
	}

	function updateCaret(target: HTMLTextAreaElement) {
		caret = target.selectionStart ?? target.value.length
		dismissed = false
		selectedIndex = 0
	}

	async function chooseMember(member: MentionMember) {
		if (!activeMention) return

		const position = activeMention.start + member.nickname.length + 2
		value = `${value.slice(0, activeMention.start)}@${member.nickname} ${value.slice(caret)}`
		dismissed = true
		await tick()
		textarea?.focus()
		textarea?.setSelectionRange(position, position)
		caret = position
	}

	function onKeydown(event: KeyboardEvent) {
		if (!suggestions.length) return

		if (event.key === 'ArrowDown') {
			event.preventDefault()
			selectedIndex = (selectedIndex + 1) % suggestions.length
		} else if (event.key === 'ArrowUp') {
			event.preventDefault()
			selectedIndex = (selectedIndex - 1 + suggestions.length) % suggestions.length
		} else if (event.key === 'Enter' || event.key === 'Tab') {
			event.preventDefault()
			chooseMember(suggestions[selectedIndex])
		} else if (event.key === 'Escape') {
			event.preventDefault()
			dismissed = true
		}
	}
</script>

<div class="mention-input">
	<label class="form-label">
		{label}
		<textarea
			bind:this={textarea}
			class="form-input"
			bind:value
			{rows}
			{required}
			{disabled}
			aria-autocomplete="list"
			oninput={(event) => updateCaret(event.currentTarget)}
			onclick={(event) => updateCaret(event.currentTarget)}
			onselect={(event) => updateCaret(event.currentTarget)}
			onkeydown={onKeydown}
		></textarea>
	</label>

	{#if suggestions.length > 0}
		<div class="suggestions" role="listbox" aria-label="Membres à mentionner">
			{#each suggestions as member, index (member.id)}
				<button
					type="button"
					class:active={index === selectedIndex}
					role="option"
					aria-selected={index === selectedIndex}
					onmousedown={(event) => event.preventDefault()}
					onclick={() => chooseMember(member)}
				>
					<strong>@{member.nickname}</strong>
					{#if member.display_name !== member.nickname}
						<span>{member.display_name}</span>
					{/if}
				</button>
			{/each}
		</div>
	{/if}
	<p class="hint">Tapez @ pour mentionner un membre du groupe.</p>
</div>

<style>
	.mention-input { position: relative; }

	.suggestions {
		position: absolute;
		z-index: 2;
		left: 0;
		right: 0;
		top: calc(100% - 1.6rem);
		max-height: 13rem;
		overflow-y: auto;
		padding: 0.25rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-bg);
		box-shadow: 0 0.4rem 1rem rgba(0, 0, 0, 0.14);
	}

	.suggestions button {
		display: flex;
		width: 100%;
		align-items: baseline;
		gap: 0.5rem;
		padding: 0.45rem 0.55rem;
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		color: inherit;
		text-align: left;
		cursor: pointer;
	}

	.suggestions button:hover,
	.suggestions button.active { background: var(--color-accent-light); }
	.suggestions span { color: var(--color-text-muted); font-size: var(--text-sm); }
	.hint { margin: 0.35rem 0 0; color: var(--color-text-muted); font-size: var(--text-sm); }
</style>
