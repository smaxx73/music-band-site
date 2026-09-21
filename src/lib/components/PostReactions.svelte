<script lang="ts">
	import Icon from '$lib/components/Icon.svelte'
	import type { ReactionSummary, ReactionValue } from '$lib/types'

	/**
	 * Pouces d'une publication, dans le fil comme sur sa page. Les noms sont écrits en
	 * clair sous les boutons plutôt qu'en infobulle : au doigt, il n'y a pas de survol.
	 */
	let {
		postId,
		reactions
	}: {
		postId: number
		reactions: ReactionSummary
	} = $props()

	// $derived inscriptible : la réponse de l'API remplace l'état, le parent le resynchronise.
	let current = $derived(reactions)
	let pending = $state(false)
	let reactError = $state<string | null>(null)

	async function react(value: ReactionValue) {
		if (pending) return
		// Re-cliquer le pouce déjà posé le retire.
		const remove = current.my_reaction === value
		pending = true
		reactError = null
		try {
			const res = await fetch(`/api/posts/${postId}/reactions`, {
				method: remove ? 'DELETE' : 'POST',
				headers: remove ? {} : { 'Content-Type': 'application/json' },
				body: remove ? undefined : JSON.stringify({ value })
			})
			const json = await res.json().catch(() => ({}))
			if (!res.ok) { reactError = json.error ?? `Erreur ${res.status}`; return }
			current = {
				up_count: json.up_count,
				down_count: json.down_count,
				up_reactors: json.up_reactors ?? [],
				down_reactors: json.down_reactors ?? [],
				my_reaction: json.my_reaction ?? null
			}
		} catch {
			reactError = 'Erreur réseau.'
		} finally {
			pending = false
		}
	}

	/** « Marc, Julie et 3 autres » : au-delà de trois noms, la ligne ne se lit plus. */
	function names(list: string[]): string {
		if (list.length <= 3) return list.join(', ')
		return `${list.slice(0, 2).join(', ')} et ${list.length - 2} autres`
	}
</script>

<div class="post-reactions">
	<div class="buttons">
		<button
			type="button"
			class="reaction"
			class:active={current.my_reaction === 1}
			disabled={pending}
			aria-pressed={current.my_reaction === 1}
			title={current.my_reaction === 1 ? 'Retirer mon pouce' : "J'aime"}
			onclick={() => react(1)}
		>
			<Icon name="thumb-up" size="0.95rem" label="J'aime" />
			{#if current.up_count > 0}<span class="count">{current.up_count}</span>{/if}
		</button>
		<button
			type="button"
			class="reaction"
			class:active={current.my_reaction === -1}
			disabled={pending}
			aria-pressed={current.my_reaction === -1}
			title={current.my_reaction === -1 ? 'Retirer mon pouce' : "Je n'aime pas"}
			onclick={() => react(-1)}
		>
			<Icon name="thumb-down" size="0.95rem" label="Je n'aime pas" />
			{#if current.down_count > 0}<span class="count">{current.down_count}</span>{/if}
		</button>
		{#if reactError}<span class="error">{reactError}</span>{/if}
	</div>

	{#if current.up_reactors.length > 0 || current.down_reactors.length > 0}
		<p class="reactors">
			{#if current.up_reactors.length > 0}
				<span><Icon name="thumb-up" size="0.75rem" /> {names(current.up_reactors)}</span>
			{/if}
			{#if current.down_reactors.length > 0}
				<span><Icon name="thumb-down" size="0.75rem" /> {names(current.down_reactors)}</span>
			{/if}
		</p>
	{/if}
</div>

<style>
	.post-reactions { display: flex; flex-direction: column; gap: 0.3rem; }

	.buttons { display: flex; align-items: center; gap: 0.4rem; }

	/* Même pastille que les pouces d'un commentaire, un cran plus grande : c'est la
	   réaction principale de la carte */
	.reaction {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		min-height: 2rem;
		padding: 0.15rem 0.65rem;
		background: transparent;
		border: 1px solid var(--color-border-light);
		border-radius: 20px;
		font: inherit;
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		cursor: pointer;
	}

	.reaction:hover:not(:disabled) { background: var(--color-bg-muted); }
	.reaction:disabled { opacity: 0.5; cursor: default; }

	.reaction.active {
		border-color: var(--color-accent);
		background: var(--color-accent-light);
		color: var(--color-accent);
	}

	.count { font-weight: 600; }

	.reactors {
		display: flex;
		flex-wrap: wrap;
		gap: 0.2rem 0.9rem;
		margin: 0;
		font-size: var(--text-xs);
		color: var(--color-text-muted);
	}

	.reactors span { display: inline-flex; align-items: center; gap: 0.25rem; }

	.error { font-size: var(--text-xs); color: var(--color-error); }
</style>
