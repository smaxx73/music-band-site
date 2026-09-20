<script lang="ts">
	import Modal from '$lib/components/Modal.svelte'

	/**
	 * Niveaux d'action : voir « Confirmations d'action » dans docs/conventions.md.
	 * `warning` protège un brouillon, `danger` une suppression irréversible.
	 */
	export type ConfirmationLevel = 'info' | 'warning' | 'danger'

	let {
		open = false,
		level = 'warning',
		title,
		message,
		confirmLabel = 'Confirmer',
		cancelLabel = 'Annuler',
		busy = false,
		onConfirm,
		onCancel
	}: {
		open?: boolean
		level?: ConfirmationLevel
		title: string
		message: string
		confirmLabel?: string
		cancelLabel?: string
		busy?: boolean
		onConfirm: () => void | Promise<void>
		onCancel: () => void
	} = $props()

	const confirmClass = $derived(level === 'danger' ? 'btn-danger' : level === 'warning' ? 'btn-primary' : 'btn-secondary')
</script>

{#if open}
	<Modal {title} size="sm" onClose={onCancel}>
		<div class="confirm-dialog" class:danger={level === 'danger'}>
			<p>{message}</p>
			<div class="confirm-actions">
				<button class="btn btn-secondary" disabled={busy} onclick={onCancel}>{cancelLabel}</button>
				<button class="btn {confirmClass}" disabled={busy} onclick={onConfirm}>
					{busy ? 'En cours…' : confirmLabel}
				</button>
			</div>
		</div>
	</Modal>
{/if}

<style>
	.confirm-dialog { padding: 0.9rem 1.25rem 1.25rem; }
	.confirm-dialog p { margin: 0; color: var(--color-text-secondary); line-height: 1.5; }
	.confirm-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1.25rem; }
	@media (max-width: 640px) { .confirm-actions > * { flex: 1; } }
</style>
