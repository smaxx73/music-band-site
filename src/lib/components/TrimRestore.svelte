<script lang="ts">
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte'
	import Icon from '$lib/components/Icon.svelte'
	import { formatTimecode } from '$lib/youtube'

	let {
		endpoint,
		startS,
		endS,
		blocked = null,
		onrestored
	}: {
		endpoint: string
		startS: number
		endS: number
		/** Ce qui empêche de rétablir pour l'instant, à la place du bouton. */
		blocked?: string | null
		onrestored: () => void | Promise<void>
	} = $props()

	let confirming = $state(false)
	let busy = $state(false)
	let error = $state<string | null>(null)

	async function restore() {
		busy = true
		error = null
		try {
			const res = await fetch(endpoint, { method: 'DELETE' })
			const body = await res.json().catch(() => ({}))
			if (!res.ok) {
				error = body.error ?? `Erreur ${res.status}`
				return
			}
			await onrestored()
		} catch {
			error = 'Erreur réseau.'
		} finally {
			busy = false
			confirming = false
		}
	}
</script>

<div class="trim-restore">
	<p>
		<Icon name="scissors" size="0.85rem" />
		Recadré à l'envoi : seul le passage de {formatTimecode(startS)} à {formatTimecode(endS)} s'écoute.
		{#if blocked}
			{blocked}
		{:else}
			<button type="button" class="btn-link" onclick={() => (confirming = true)} disabled={busy}>Rétablir l'enregistrement entier</button>
		{/if}
	</p>
	{#if error}<p class="message-error" role="alert">{error}</p>{/if}
</div>

<ConfirmDialog
	open={confirming}
	level="warning"
	title="Rétablir l'enregistrement entier ?"
	message="Le début et la fin écartés à l'envoi reviennent, et tous ceux qui ont accès à ce son les entendront. Les repères des commentaires sont décalés d'autant : ils restent sur les mêmes notes."
	confirmLabel={busy ? 'Rétablissement…' : 'Rétablir'}
	{busy}
	onConfirm={restore}
	onCancel={() => (confirming = false)}
/>

<style>
	.trim-restore { display: flex; flex-direction: column; gap: 0.4rem; }
	.trim-restore p { margin: 0; font-size: var(--text-sm); color: var(--color-text-muted); }
</style>
