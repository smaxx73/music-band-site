<script lang="ts">
	import { formatDateOnly } from '$lib/date'

	type PlaylistItem = {
		id: number
		position: number
		note: string | null
		recording_id: number
		take: number
		duration_s: number | null
		recording_status: string
		file_path: string
		song_id: number
		song_title: string
		song_composer: string | null
		session_id: number
		session_date: string
		session_location: string | null
	}

	let {
		items,
		currentIndex,
		error = null,
		onSelect = () => {},
		onReorder = () => {},
		onRemove = () => {}
	}: {
		items: PlaylistItem[]
		currentIndex: number
		error?: string | null
		onSelect?: (index: number) => void
		onReorder?: (fromIndex: number, toIndex: number) => void
		onRemove?: (itemId: number, index: number) => void
	} = $props()

	let draggedIdx = $state<number | null>(null)
	let dropTargetIdx = $state<number | null>(null)

	function formatTime(s: number) {
		if (!isFinite(s) || !s) return '0:00'
		const m = Math.floor(s / 60)
		return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`
	}

	function formatDate(d: string | Date) {
		return formatDateOnly(d, {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		})
	}

	function onDragStart(event: DragEvent, idx: number) {
		draggedIdx = idx
		event.dataTransfer?.setData('text/plain', String(idx))
	}

	function onDragOver(event: DragEvent, idx: number) {
		event.preventDefault()
		dropTargetIdx = idx
	}

	function onDragLeave() {
		dropTargetIdx = null
	}

	function onDragEnd() {
		draggedIdx = null
		dropTargetIdx = null
	}

	function onDrop(event: DragEvent, toIdx: number) {
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
	<p class="save-error">{error}</p>
{/if}

<ul class="items-list">
	{#each items as item, i (item.id)}
		<li
			class="item"
			class:active={i === currentIndex}
			class:drag-over={dropTargetIdx === i && draggedIdx !== i}
			draggable={true}
			ondragstart={(event) => onDragStart(event, i)}
			ondragover={(event) => onDragOver(event, i)}
			ondragleave={onDragLeave}
			ondragend={onDragEnd}
			ondrop={(event) => onDrop(event, i)}
		>
			<span class="drag-handle" aria-hidden="true">⠿</span>
			<button class="item-body" onclick={() => onSelect(i)}>
				<span class="item-pos">{i + 1}</span>
				<span class="item-info">
					<span class="item-title">{item.song_title}</span>
					<span class="item-meta">
						prise #{item.take} · {formatDate(item.session_date)}
						{#if item.session_location} · {item.session_location}{/if}
						{#if item.duration_s} · {formatTime(item.duration_s)}{/if}
					</span>
					{#if item.note}<span class="item-note">{item.note}</span>{/if}
				</span>
			</button>
			<button
				class="remove-btn"
				onclick={() => onRemove(item.id, i)}
				title="Retirer de la playlist"
			>✕</button>
		</li>
	{/each}
</ul>

<style>
	.items-list {
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
		border: 1px solid #f0f0f0;
		border-radius: 6px;
		padding: 0.5rem 0.75rem;
		transition: background 0.1s, border-color 0.1s;
		cursor: default;
	}

	.item.active {
		background: #f0f7ff;
		border-color: #bfdbfe;
	}

	.item.drag-over {
		border-color: #1a1a1a;
		border-style: dashed;
	}

	.item:hover:not(.active) {
		background: #fafafa;
	}

	.drag-handle {
		color: #ccc;
		cursor: grab;
		font-size: 1rem;
		user-select: none;
	}

	.drag-handle:active {
		cursor: grabbing;
	}

	.item-body {
		flex: 1;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		text-align: left;
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}

	.item-pos {
		font-size: 0.75rem;
		color: #bbb;
		width: 1.5rem;
		text-align: right;
		flex-shrink: 0;
	}

	.item-info {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}

	.item-title {
		font-weight: 600;
		font-size: 0.875rem;
	}

	.item-meta {
		font-size: 0.75rem;
		color: #999;
	}

	.item-note {
		font-size: 0.75rem;
		color: #888;
		font-style: italic;
	}

	.remove-btn {
		background: none;
		border: none;
		color: #ccc;
		cursor: pointer;
		font-size: 0.8rem;
		padding: 0.2rem 0.3rem;
		border-radius: 3px;
		line-height: 1;
	}

	.remove-btn:hover {
		color: #c0392b;
		background: #fef2f2;
	}

	.save-error {
		color: #c0392b;
		font-size: 0.82rem;
		margin: 0 0 0.75rem;
	}
</style>
