<script lang="ts">
	import { onMount } from 'svelte'
	import Modal from '$lib/components/Modal.svelte'
	import { formatDateTime } from '$lib/date'

	// Demander la suppression d'une prise qu'on n'a pas le droit de supprimer : la demande
	// part en notification chez ceux qui le peuvent (déposant, admins du groupe), qu'on
	// nomme avant l'envoi. Voir src/lib/server/deletion-requests.ts.

	type Recipient = { id: number; display_name: string; is_uploader: boolean }

	const REASON_MAX = 200

	let {
		recordingId,
		label,
		onClose,
		onSent
	}: {
		recordingId: number
		/** « Sunny — prise 3 », pour le titre de la fenêtre. */
		label: string
		onClose: () => void
		onSent?: (requestedAt: string) => void
	} = $props()

	let recipients = $state<Recipient[] | null>(null)
	let requestedAt = $state<string | null>(null)
	let reason = $state('')
	let loadError = $state<string | null>(null)
	let sendError = $state<string | null>(null)
	let sending = $state(false)

	onMount(async () => {
		try {
			const res = await fetch(`/api/recordings/${recordingId}/deletion-request`)
			const body = await res.json()
			if (!res.ok) { loadError = body.error ?? 'Erreur.'; return }
			recipients = body.recipients
			requestedAt = body.requested_at
		} catch {
			loadError = 'Erreur réseau.'
		}
	})

	async function send() {
		if (sending || !recipients?.length) return
		sending = true
		sendError = null
		try {
			const res = await fetch(`/api/recordings/${recordingId}/deletion-request`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ reason })
			})
			const body = await res.json()
			if (!res.ok) { sendError = body.error ?? 'Erreur.'; return }
			onSent?.(body.requested_at)
			onClose()
		} catch {
			sendError = 'Erreur réseau.'
		} finally {
			sending = false
		}
	}
</script>

<Modal title="Demander la suppression" size="sm" {onClose}>
	<div class="request">
		<p class="lead">
			Seuls la personne qui a déposé <strong>{label}</strong> et les admins du groupe peuvent la
			supprimer. Ta demande leur arrivera dans les notifications.
		</p>

		{#if loadError}
			<p class="message-error">{loadError}</p>
		{:else if recipients === null}
			<p class="muted">Chargement…</p>
		{:else if recipients.length === 0}
			<p class="message-error">
				Personne dans le groupe ne peut la supprimer : ni son déposant ni un admin du groupe
				n'en est membre. Demande à un admin de la plateforme.
			</p>
		{:else}
			<ul class="recipients" aria-label="Recevront la demande">
				{#each recipients as r (r.id)}
					<li><strong>{r.display_name}</strong> <span class="muted">· {r.is_uploader ? 'a déposé la prise' : 'admin du groupe'}</span></li>
				{/each}
			</ul>

			{#if requestedAt}
				<p class="muted">
					Tu l'as déjà demandé ({formatDateTime(requestedAt)}). Renvoyer remplace ta demande précédente.
				</p>
			{/if}

			<label class="form-label" for="deletion-reason">Pourquoi ? <span class="muted">(facultatif)</span></label>
			<textarea
				id="deletion-reason"
				class="form-input"
				rows="2"
				maxlength={REASON_MAX}
				placeholder="Doublon de la prise 2, essai raté, conversation enregistrée…"
				bind:value={reason}
				disabled={sending}
				onkeydown={(e) => {
					if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send()
				}}
			></textarea>
		{/if}

		{#if sendError}<p class="message-error">{sendError}</p>{/if}

		<div class="actions">
			<button class="btn btn-secondary" disabled={sending} onclick={onClose}>Annuler</button>
			{#if recipients?.length}
				<button class="btn btn-primary" disabled={sending} onclick={send}>
					{sending ? 'Envoi…' : requestedAt ? 'Renvoyer la demande' : 'Envoyer la demande'}
				</button>
			{/if}
		</div>
	</div>
</Modal>

<style>
	.request { padding: 0.9rem 1.25rem 1.25rem; display: flex; flex-direction: column; gap: 0.6rem; }
	.request p { margin: 0; line-height: 1.5; }
	.lead { color: var(--color-text-secondary); }
	.muted { color: var(--color-text-muted); font-size: var(--text-sm); }
	.recipients { margin: 0; padding-left: 1.1rem; font-size: var(--text-sm); }
	.recipients li + li { margin-top: 0.15rem; }
	textarea { width: 100%; resize: vertical; font-family: inherit; }
	.actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.4rem; }
	@media (max-width: 640px) { .actions > * { flex: 1; } }
</style>
