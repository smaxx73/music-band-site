<script lang="ts">
	import { formatTimecode } from '$lib/youtube'
	import type { SetlistItemView } from '$lib/types'

	let {
		items,
		editable = false,
		error = null,
		busy = false,
		onReorder = () => {},
		onRemove = () => {}
	}: {
		items: SetlistItemView[]
		/** Les actions sur le programme ne sont disponibles qu'en mode édition. */
		editable?: boolean
		error?: string | null
		busy?: boolean
		onReorder?: (fromIndex: number, toIndex: number) => void
		onRemove?: (itemId: number, index: number) => void
	} = $props()

	let draggedIdx = $state<number | null>(null)
	let dropTargetIdx = $state<number | null>(null)

	function onDragStart(event: DragEvent, idx: number) {
		if (!editable) return
		draggedIdx = idx
		event.dataTransfer?.setData('text/plain', String(idx))
	}

	function onDragOver(event: DragEvent, idx: number) {
		if (!editable) return
		event.preventDefault()
		dropTargetIdx = idx
	}

	function onDragEnd() {
		draggedIdx = null
		dropTargetIdx = null
	}

	function onDrop(event: DragEvent, toIdx: number) {
		if (!editable) return
		event.preventDefault()
		if (draggedIdx === null || draggedIdx === toIdx) {
			onDragEnd()
			return
		}
		onReorder(draggedIdx, toIdx)
		onDragEnd()
	}
</script>

{#if error}
	<p class="message-error" style="margin-bottom: 0.75rem;">{error}</p>
{/if}

<ol class="setlist">
	{#each items as item, i (item.id)}
		<li
			class="item"
			class:drag-over={dropTargetIdx === i && draggedIdx !== i}
			draggable={editable && !busy}
			ondragstart={(event) => onDragStart(event, i)}
			ondragover={(event) => onDragOver(event, i)}
			ondragleave={() => (dropTargetIdx = null)}
			ondragend={onDragEnd}
			ondrop={(event) => onDrop(event, i)}
		>
			{#if editable}
				<span class="drag-handle" aria-hidden="true">⠿</span>
			{/if}
			<span class="pos">{i + 1}</span>
			<span class="info">
				<a class="title" href="/songs/{item.song_id}">{item.song_title}</a>
				<span class="meta">
					{#if item.song_composer}{item.song_composer}{/if}
					{#if item.song_key}{item.song_composer ? ' · ' : ''}{item.song_key}{/if}
					{#if item.song_status === 'en_apprentissage'}
						<span class="badge">en apprentissage</span>
					{/if}
				</span>
			</span>
			<span class="duration" class:unknown={item.reference_duration_s === null}>
				{item.reference_duration_s === null ? '—:—' : formatTimecode(item.reference_duration_s)}
			</span>
			{#if editable}
				<!-- Les flèches ne doublent pas le glisser-déposer, elles le remplacent au doigt :
				     le drag HTML5 ne fonctionne pas sur écran tactile, et une setlist se réordonne
				     surtout depuis un téléphone, en répétition. -->
				<span class="move">
					<button
						class="move-btn"
						disabled={busy || i === 0}
						title="Monter"
						aria-label="Monter {item.song_title}"
						onclick={() => onReorder(i, i - 1)}
					>↑</button>
					<button
						class="move-btn"
						disabled={busy || i === items.length - 1}
						title="Descendre"
						aria-label="Descendre {item.song_title}"
						onclick={() => onReorder(i, i + 1)}
					>↓</button>
				</span>
				<button
					class="remove-btn"
					disabled={busy}
					title="Retirer de la setlist"
					aria-label="Retirer {item.song_title} de la setlist"
					onclick={() => onRemove(item.id, i)}
				>✕</button>
			{/if}
		</li>
	{/each}
</ol>

<style>
	.setlist {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		border: 1px solid var(--color-border-light);
		border-radius: var(--radius-lg);
		padding: 0.5rem 0.75rem;
		transition: background 0.1s, border-color 0.1s;
	}

	.item:hover { background: var(--color-bg-subtle); }
	.item.drag-over { border-color: var(--color-primary); border-style: dashed; }

	.drag-handle { color: #ccc; cursor: grab; user-select: none; }
	.drag-handle:active { cursor: grabbing; }

	.pos {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		width: 1.5rem;
		text-align: right;
		flex-shrink: 0;
	}

	.info { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; flex: 1; overflow-wrap: anywhere; }
	.title { font-weight: 600; font-size: var(--text-sm); color: inherit; text-decoration: none; }
	.title:hover { color: var(--color-accent); text-decoration: underline; }
	.meta { font-size: var(--text-xs); color: var(--color-text-muted); }

	.badge {
		font-size: var(--text-xs);
		background: var(--color-bg-subtle);
		border: 1px solid var(--color-border-light);
		border-radius: var(--radius-sm);
		padding: 0 0.3rem;
		margin-left: 0.3rem;
	}

	.duration { font-size: var(--text-xs); color: var(--color-text-secondary); flex-shrink: 0; }
	/* Une durée inconnue se voit sans se lire comme un zéro. */
	.duration.unknown { color: #ccc; }

	.move { display: flex; gap: 0.1rem; flex-shrink: 0; }

	.move-btn, .remove-btn {
		background: none;
		border: none;
		color: var(--color-text-muted);
		cursor: pointer;
		font-size: 0.85rem;
		padding: 0.25rem 0.35rem;
		border-radius: var(--radius-sm);
		line-height: 1;
	}

	.move-btn:hover:not(:disabled) { color: var(--color-accent); background: var(--color-bg-subtle); }
	.move-btn:disabled { opacity: var(--disabled-opacity); cursor: default; }
	.remove-btn:hover:not(:disabled) { color: var(--color-error); background: #fef2f2; }
	.remove-btn:disabled { opacity: var(--disabled-opacity); cursor: wait; }

	@media (max-width: 640px) {
		/* Le glisser-déposer n'existe pas au doigt : la poignée ne promet rien ici. */
		.drag-handle { display: none; }
		.move-btn, .remove-btn { font-size: 1rem; padding: 0.4rem 0.45rem; }
	}
</style>
