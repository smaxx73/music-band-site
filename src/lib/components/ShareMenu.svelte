<script lang="ts">
	import { tick } from 'svelte'
	import Icon from '$lib/components/Icon.svelte'
	import { formatTimecode } from '$lib/youtube'
	import { copyText, groupRecordingLink, publicLinksLabel } from '$lib/share-client'

	/**
	 * Un seul bouton « Partager » pour les deux portées d'une prise : le lien pour le groupe,
	 * qui se copie d'un geste, et le lien d'écoute public, qui se gère dans sa modale. Deux
	 * boutons côte à côte prenaient la place de toutes les autres commandes, et une modale
	 * pour copier un lien était un détour.
	 */
	let {
		recordingId,
		time = null,
		canSharePublic = false,
		shareCount = 0,
		showCount = true,
		label = null,
		buttonClass = 'btn btn-secondary btn-sm',
		class: className = '',
		onOpenPublic
	}: {
		recordingId: number
		/** Position du lecteur, en secondes : reprise dans le lien pour le groupe. */
		time?: number | null
		/** Droit de partager (`canSharePublicly`) et piste audio présente. */
		canSharePublic?: boolean
		shareCount?: number
		/** Faux là où une pastille dit déjà le nombre de liens publics (ligne de prise). */
		showCount?: boolean
		/** Sans libellé, le bouton se réduit à son icône. */
		label?: string | null
		buttonClass?: string
		/** Classe du conteneur (bouton et panneau) : `row-wide-only` le retire d'une ligne étroite. */
		class?: string
		onOpenPublic: () => void
	} = $props()

	let open = $state(false)
	let root = $state<HTMLElement | null>(null)
	let button = $state<HTMLButtonElement | null>(null)
	let panel = $state<HTMLElement | null>(null)
	let alignLeft = $state(false)
	let copied = $state(false)
	let failedUrl = $state<string | null>(null)
	let closeTimer: ReturnType<typeof setTimeout> | undefined

	// Les écouteurs ne vivent que le temps de l'ouverture : une session affiche des
	// dizaines de prises, chacune avec son menu.
	$effect(() => {
		if (!open) return

		const closeOnOutside = (e: MouseEvent) => {
			if (root && !root.contains(e.target as Node)) close()
		}
		const closeOnEscape = (e: KeyboardEvent) => {
			if (e.key !== 'Escape') return
			close()
			button?.focus()
		}

		document.addEventListener('click', closeOnOutside)
		document.addEventListener('keydown', closeOnEscape)
		return () => {
			document.removeEventListener('click', closeOnOutside)
			document.removeEventListener('keydown', closeOnEscape)
		}
	})

	async function toggle() {
		if (open) { close(); return }
		copied = false
		failedUrl = null
		alignLeft = false
		open = true
		await tick()
		// Calé à droite du bouton par défaut ; un bouton au bord gauche (en-tête replié sur
		// téléphone) ferait sortir le panneau de l'écran.
		if (panel && panel.getBoundingClientRect().left < 8) alignLeft = true
		panel?.scrollIntoView({ block: 'nearest' })
	}

	function close() {
		clearTimeout(closeTimer)
		open = false
	}

	async function copyGroupLink() {
		const url = groupRecordingLink(recordingId, time)
		failedUrl = null
		if (await copyText(url)) {
			copied = true
			// Le temps de lire la confirmation, puis le menu s'efface de lui-même.
			closeTimer = setTimeout(close, 1200)
		} else {
			failedUrl = url
		}
	}

	function openPublic() {
		close()
		onOpenPublic()
	}
</script>

<div class="share-menu {className}" bind:this={root}>
	<button
		class={buttonClass}
		class:btn-icon={!label}
		bind:this={button}
		onclick={toggle}
		aria-haspopup="menu"
		aria-expanded={open}
		title="Partager la prise"
		aria-label={showCount && shareCount > 0 ? `Partager — ${publicLinksLabel(shareCount)}` : 'Partager'}
	>
		<Icon name="link" />
		{#if label}<span class="btn-label">{label}</span>{/if}
		{#if showCount && shareCount > 0}
			<span class="share-badge" aria-hidden="true"><Icon name="globe" size="0.75rem" />{shareCount}</span>
		{/if}
	</button>

	{#if open}
		<div class="share-panel" class:align-left={alignLeft} role="menu" bind:this={panel}>
			<button class="share-item" role="menuitem" onclick={copyGroupLink}>
				<Icon name={copied ? 'check' : 'link'} />
				<span class="share-item-text">
					<span class="share-item-title">{copied ? 'Lien copié' : 'Copier le lien pour le groupe'}</span>
					<span class="share-item-hint">
						Membres du groupe{#if time !== null}&nbsp;· à {formatTimecode(time)}{/if}
					</span>
				</span>
			</button>
			{#if failedUrl}
				<div class="share-fallback">
					<span>Copie impossible, sélectionne le lien :</span>
					<input
						class="form-input"
						type="text"
						readonly
						value={failedUrl}
						aria-label="Lien pour le groupe"
						onfocus={(e) => e.currentTarget.select()}
					/>
				</div>
			{/if}
			{#if canSharePublic}
				<button class="share-item" role="menuitem" onclick={openPublic}>
					<Icon name="globe" />
					<span class="share-item-text">
						<span class="share-item-title">Lien d'écoute public…</span>
						<span class="share-item-hint">
							{shareCount > 0 ? publicLinksLabel(shareCount) : 'Sans compte, à durée limitée'}
						</span>
					</span>
				</button>
			{/if}
		</div>
	{/if}
</div>

<style>
	.share-menu { position: relative; display: inline-flex; }

	.share-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.15rem;
		padding: 0 0.35rem;
		border-radius: var(--radius-pill);
		background: var(--color-accent-light);
		color: var(--color-accent);
		font-size: var(--text-xs);
		font-weight: 600;
		line-height: 1.2rem;
	}

	.share-panel {
		position: absolute;
		top: calc(100% + 6px);
		right: 0;
		z-index: 40;
		width: max-content;
		min-width: 15rem;
		max-width: min(20rem, calc(100vw - 1.5rem));
		display: flex;
		flex-direction: column;
		padding: 0.25rem;
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-modal);
		text-align: left;
	}

	.share-panel.align-left { right: auto; left: 0; }

	.share-item {
		display: flex;
		align-items: flex-start;
		gap: 0.6rem;
		width: 100%;
		padding: 0.5rem 0.6rem;
		background: none;
		border: none;
		border-radius: var(--radius-sm);
		font: inherit;
		color: var(--color-text);
		text-align: left;
		cursor: pointer;
	}

	.share-item:hover,
	.share-item:focus-visible { background: var(--color-bg-subtle); }

	.share-item :global(svg) { flex-shrink: 0; margin-top: 0.15rem; color: var(--color-text-secondary); }

	.share-item-text { display: flex; flex-direction: column; gap: 0.05rem; min-width: 0; }
	.share-item-title { font-size: var(--text-sm); font-weight: 600; }
	.share-item-hint { font-size: var(--text-xs); color: var(--color-text-muted); }

	.share-fallback {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		padding: 0 0.6rem 0.5rem;
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
	}

	.share-fallback input { min-width: 0; font-size: var(--text-xs); }

	@media (max-width: 640px) {
		.share-item { min-height: 44px; }
	}
</style>
