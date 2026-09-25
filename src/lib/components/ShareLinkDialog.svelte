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
	 * Liens d'écoute publics d'un enregistrement : en créer, les révoquer. Le jeton n'est
	 * gardé qu'en empreinte : un lien ne s'affiche qu'une fois, à sa création. La liste
	 * montre donc les liens actifs sans leur adresse — de quoi savoir qu'ils existent et
	 * les refermer.
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
	let createdUrl = $state<string | null>(null)
	let copied = $state(false)
	let copyFailed = $state(false)
	let urlField = $state<HTMLInputElement | null>(null)

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
		createdUrl = null
		try {
			const res = await fetch('/api/share-links', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ [param]: target.id, expires_in_days: days })
			})
			if (!res.ok) { error = await readError(res, 'Impossible de créer le lien.'); return }
			const { token, ...link } = await res.json() as ShareLinkView & { token: string }
			links = [link, ...links]
			onCountChange(links.length)
			createdUrl = shareUrl(location.origin, token)
			await copy()
		} catch {
			error = 'Erreur réseau.'
		} finally {
			creating = false
		}
	}

	async function copy() {
		if (!createdUrl) return
		copied = false
		copyFailed = false
		try {
			await navigator.clipboard.writeText(createdUrl)
			copied = true
			setTimeout(() => (copied = false), 2000)
		} catch {
			// Presse-papiers refusé : le lien est sélectionné dans le champ, à copier à la main.
			copyFailed = true
			urlField?.select()
		}
	}

	async function revoke(id: number) {
		revokingId = id
		error = null
		try {
			const res = await fetch(`/api/share-links/${id}`, { method: 'DELETE' })
			if (!res.ok) { error = await readError(res, 'Impossible de révoquer le lien.'); return }
			links = links.filter((l) => l.id !== id)
			onCountChange(links.length)
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
				Toute personne qui a le lien peut <strong>écouter et télécharger</strong> ce fichier audio,
				sans compte. Elle ne voit ni les commentaires, ni la note, ni les participants.
			</span>
		</p>

		{#if createdUrl}
			<div class="created">
				<label class="form-label" for="share-url">Lien créé{copied ? ' et copié' : ''}</label>
				<div class="url-row">
					<input id="share-url" class="form-input" type="text" readonly value={createdUrl} bind:this={urlField} onfocus={(e) => e.currentTarget.select()} />
					<button class="btn btn-secondary btn-sm" onclick={copy}>
						{#if copied}<Icon name="check" /> Copié{:else}<Icon name="link" /> Copier{/if}
					</button>
				</div>
				<p class="warn">
					{copyFailed ? 'Copie automatique impossible : copie-le depuis le champ. ' : ''}Il ne sera
					plus affiché ensuite. Perdu, il se révoque et se recrée.
				</p>
			</div>
		{/if}

		<div class="create-row">
			<label class="form-label" for="share-days">Valable</label>
			<select id="share-days" class="form-input" bind:value={days} disabled={creating}>
				{#each SHARE_DURATIONS_DAYS as d (d)}
					<option value={d}>{SHARE_DURATION_LABELS[d]}</option>
				{/each}
			</select>
			<button class="btn btn-primary btn-sm" onclick={create} disabled={creating}>
				{creating ? 'Création…' : createdUrl ? 'Créer un autre lien' : 'Créer un lien'}
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
						<button class="btn btn-ghost btn-sm" onclick={() => revoke(link.id)} disabled={revokingId === link.id}>
							{revokingId === link.id ? 'Révocation…' : 'Révoquer'}
						</button>
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

	.created {
		padding: 0.75rem; border-radius: var(--radius-md);
		background: var(--color-bg-subtle); border: 1px solid var(--color-border-light);
	}
	.url-row { display: flex; gap: 0.4rem; margin-top: 0.3rem; }
	.url-row input { flex: 1; min-width: 0; font-family: var(--font-mono, monospace); font-size: var(--text-xs); }
	.warn { margin: 0.4rem 0 0; font-size: var(--text-xs); color: var(--color-text-muted); }

	.create-row { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
	.create-row .form-label { margin: 0; }
	.create-row select { width: auto; }

	h3 { font-size: var(--text-sm); margin: 0.3rem 0 0; }
	.empty { margin: 0; font-size: var(--text-sm); color: var(--color-text-muted); }

	.links { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.4rem; }
	.links li {
		display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;
		padding: 0.5rem 0.65rem; border: 1px solid var(--color-border-light); border-radius: var(--radius-md);
	}
	.link-meta { display: flex; flex-direction: column; gap: 0.1rem; font-size: var(--text-sm); min-width: 0; }
	.muted { font-size: var(--text-xs); color: var(--color-text-muted); }

	@media (max-width: 640px) {
		.links li { flex-direction: column; align-items: stretch; }
	}
</style>
