<script lang="ts">
	import Icon from '$lib/components/Icon.svelte'
	import Menu from '$lib/components/Menu.svelte'
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
	let copied = $state(false)
	let failedUrl = $state<string | null>(null)
	let closeTimer: ReturnType<typeof setTimeout> | undefined

	// Chaque ouverture repart d'un menu neuf, sans la confirmation de la copie précédente.
	$effect(() => {
		if (open) return
		clearTimeout(closeTimer)
		copied = false
		failedUrl = null
	})

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

<Menu bind:open class={className} --menu-min-width="15rem">
	{#snippet trigger(menu)}
		<button
			{...menu}
			class={buttonClass}
			class:btn-icon={!label}
			title="Partager la prise"
			aria-label={showCount && shareCount > 0 ? `Partager — ${publicLinksLabel(shareCount)}` : 'Partager'}
		>
			<Icon name="link" />
			{#if label}<span class="btn-label">{label}</span>{/if}
			{#if showCount && shareCount > 0}
				<span class="share-badge" aria-hidden="true"><Icon name="globe" size="0.75rem" />{shareCount}</span>
			{/if}
		</button>
	{/snippet}

	<button class="menu-item" role="menuitem" onclick={copyGroupLink}>
		<Icon name={copied ? 'check' : 'link'} />
		<span class="menu-item-text">
			<span class="menu-item-title">{copied ? 'Lien copié' : 'Copier le lien pour le groupe'}</span>
			<span class="menu-item-hint">
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
		<button class="menu-item" role="menuitem" onclick={openPublic}>
			<Icon name="globe" />
			<span class="menu-item-text">
				<span class="menu-item-title">Lien d'écoute public…</span>
				<span class="menu-item-hint">
					{shareCount > 0 ? publicLinksLabel(shareCount) : 'Sans compte, à durée limitée'}
				</span>
			</span>
		</button>
	{/if}
</Menu>

<style>
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

	.share-fallback {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		padding: 0 0.6rem 0.5rem;
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
	}

	.share-fallback input { min-width: 0; font-size: var(--text-xs); }
</style>
