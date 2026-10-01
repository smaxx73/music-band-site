<script lang="ts">
	import { onMount } from 'svelte'
	import Modal from '$lib/components/Modal.svelte'
	import Icon from '$lib/components/Icon.svelte'
	import { formatDateOnly, formatDateTime } from '$lib/date'
	import {
		SHARE_DEFAULT_DAYS,
		SHARE_DURATIONS_DAYS,
		SHARE_DURATION_LABELS,
		shareUrl,
		type ShareDurationDays,
		type ShareLinkView,
		type ShareTarget
	} from '$lib/types'

	/**
	 * Liens d'écoute publics d'un enregistrement : en créer, les recopier, les révoquer.
	 * Un lien se recopie autant de fois qu'on veut le partager : en recréer un à chaque
	 * destinataire multiplierait les accès ouverts à révoquer un jour.
	 */
	let {
		target,
		onClose,
		onCountChange = () => {}
	}: {
		target: ShareTarget
		onClose: () => void
		/** Nombre de liens actifs, pour que la page signale l'enregistrement partagé. */
		onCountChange?: (count: number) => void
	} = $props()

	const param = $derived(target.kind === 'recording' ? 'recording_id' : 'personal_recording_id')

	let links = $state<ShareLinkView[]>([])
	let loading = $state(true)
	let error = $state<string | null>(null)
	let days = $state<ShareDurationDays>(SHARE_DEFAULT_DAYS)
	let creating = $state(false)
	let revokingId = $state<number | null>(null)
	let copiedId = $state<number | null>(null)
	/** Lien dont la copie a été refusée : son adresse s'affiche, à copier à la main. */
	let manualId = $state<number | null>(null)
	let copiedTimer: ReturnType<typeof setTimeout> | undefined

	async function readError(res: Response, fallback: string) {
		const body = await res.json().catch(() => ({})) as { error?: string }
		return body.error ?? fallback
	}

	onMount(() => {
		void load()
	})

	async function load() {
		loading = true
		error = null
		try {
			const res = await fetch(`/api/share-links?${param}=${target.id}`)
			if (!res.ok) { error = await readError(res, 'Impossible de charger les liens.'); return }
			links = await res.json() as ShareLinkView[]
			onCountChange(links.length)
		} catch {
			error = 'Erreur réseau.'
		} finally {
			loading = false
		}
	}

	async function create() {
		creating = true
		error = null
		try {
			const res = await fetch('/api/share-links', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ [param]: target.id, expires_in_days: days })
			})
			if (!res.ok) { error = await readError(res, 'Impossible de créer le lien.'); return }
			const link = await res.json() as ShareLinkView
			links = [link, ...links]
			onCountChange(links.length)
			await copy(link)
		} catch {
			error = 'Erreur réseau.'
		} finally {
			creating = false
		}
	}

	async function copy(link: ShareLinkView) {
		if (!link.token) return
		clearTimeout(copiedTimer)
		copiedId = null
		try {
			await navigator.clipboard.writeText(shareUrl(location.origin, link.token))
			manualId = null
			copiedId = link.id
			copiedTimer = setTimeout(() => (copiedId = null), 2500)
		} catch {
			// Presse-papiers refusé (contexte non sécurisé) : l'adresse s'affiche dans un champ.
			manualId = link.id
		}
	}

	function selectOnMount(node: HTMLInputElement) {
		node.focus()
		node.select()
	}

	async function revoke(id: number) {
		revokingId = id
		error = null
		try {
			const res = await fetch(`/api/share-links/${id}`, { method: 'DELETE' })
			if (!res.ok) { error = await readError(res, 'Impossible de révoquer le lien.'); return }
			links = links.filter((l) => l.id !== id)
			onCountChange(links.length)
			if (manualId === id) manualId = null
		} catch {
			error = 'Erreur réseau.'
		} finally {
			revokingId = null
		}
	}

	const longDate = { day: 'numeric', month: 'long', year: 'numeric' } as const
</script>

<Modal title="Lien d'écoute public" {onClose}>
	<div class="share-dialog">
		<p class="explain">
			<Icon name="globe" size="0.9rem" />
			<span>
				Qui a le lien peut <strong>écouter et télécharger</strong> ce fichier, sans compte —
				rien d'autre : ni commentaires, ni note, ni participants.
			</span>
		</p>

		<div class="create-row">
			<label class="form-label" for="share-days">Valable</label>
			<select id="share-days" class="form-input" bind:value={days} disabled={creating}>
				{#each SHARE_DURATIONS_DAYS as d (d)}
					<option value={d}>{SHARE_DURATION_LABELS[d]}</option>
				{/each}
			</select>
			<button class="btn btn-primary btn-sm" onclick={create} disabled={creating}>
				{creating ? 'Création…' : 'Créer un lien'}
			</button>
		</div>

		{#if error}<p class="message-error">{error}</p>{/if}

		<h3>Liens actifs</h3>
		{#if loading}
			<p class="empty">Chargement…</p>
		{:else if links.length === 0}
			<p class="empty">
				{target.kind === 'recording'
					? "Aucun lien actif : cette prise n'est pas écoutable hors du groupe."
					: "Aucun lien actif : cet enregistrement n'est pas écoutable sans compte."}
			</p>
		{:else}
			<ul class="links">
				{#each links as link (link.id)}
					<li>
						<div class="link-meta">
							<span>Créé le {formatDateOnly(link.created_at, longDate)}{link.created_by ? ` par ${link.created_by}` : ''}</span>
							<span class="muted">
								expire le {formatDateOnly(link.expires_at, longDate)} ·
								{link.last_accessed_at ? `ouvert pour la dernière fois ${formatDateTime(link.last_accessed_at)}` : 'jamais ouvert'}
							</span>
						</div>
						<div class="link-actions">
							{#if link.token}
								<button class="btn btn-secondary btn-sm" onclick={() => copy(link)}>
									{#if copiedId === link.id}<Icon name="check" /> Copié{:else}<Icon name="link" /> Copier{/if}
								</button>
							{/if}
							<button class="btn btn-ghost btn-sm" onclick={() => revoke(link.id)} disabled={revokingId === link.id}>
								{revokingId === link.id ? 'Révocation…' : 'Révoquer'}
							</button>
						</div>
						{#if link.token && manualId === link.id}
							<input
								class="form-input manual-url"
								type="text"
								readonly
								value={shareUrl(location.origin, link.token)}
								aria-label="Adresse du lien public"
								use:selectOnMount
								onfocus={(e) => e.currentTarget.select()}
							/>
							<p class="muted manual-hint">Copie automatique impossible : copie l'adresse depuis le champ.</p>
						{:else if !link.token}
							<p class="muted manual-hint">
								Lien créé avant qu'on puisse les recopier : son adresse n'a pas été gardée.
								Pour le repartager, crée un nouveau lien et révoque celui-ci.
							</p>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</Modal>

<style>
	.share-dialog { padding: 0.9rem 1.25rem 1.25rem; display: flex; flex-direction: column; gap: 0.9rem; }

	.explain {
		display: flex; gap: 0.5rem; align-items: flex-start; margin: 0;
		font-size: var(--text-sm); color: var(--color-text-secondary); line-height: 1.5;
	}
	.explain :global(svg) { flex-shrink: 0; margin-top: 0.2rem; }

	.create-row { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
	.create-row .form-label { margin: 0; }
	.create-row select { width: auto; }

	h3 { font-size: var(--text-sm); margin: 0.3rem 0 0; }
	.empty { margin: 0; font-size: var(--text-sm); color: var(--color-text-muted); }

	.links { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.4rem; }
	.links li {
		display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.4rem 0.75rem;
		padding: 0.5rem 0.65rem; border: 1px solid var(--color-border-light); border-radius: var(--radius-md);
	}
	.link-meta { display: flex; flex-direction: column; gap: 0.1rem; font-size: var(--text-sm); min-width: 0; flex: 1 1 12rem; }
	.link-actions { display: flex; gap: 0.3rem; flex-shrink: 0; }
	.manual-url { flex-basis: 100%; font-family: var(--font-mono, monospace); font-size: var(--text-xs); }
	.manual-hint { flex-basis: 100%; margin: 0; }
	.muted { font-size: var(--text-xs); color: var(--color-text-muted); }

	@media (max-width: 640px) {
		.link-actions .btn { min-height: 2.5rem; }
		.links li { align-items: flex-start; }
	}
</style>
