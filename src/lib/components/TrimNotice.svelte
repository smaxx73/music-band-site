<script lang="ts">
	import { formatTimecode } from '$lib/youtube'
	import type { AudioTrim } from '$lib/types'

	let {
		trim,
		durationS,
		fate
	}: {
		trim: AudioTrim | null
		durationS: number
		/** Ce que devient le reste à l'envoi : gardé pour se rétablir, ou proposé à la découpe. */
		fate?: 'kept' | 'split'
	} = $props()

	// Arrondi : la durée vient du chronomètre ou du fichier, à quelques dixièmes près.
	const label = (seconds: number) => formatTimecode(Math.round(seconds))
</script>

<!-- Ce qu'on n'entendra pas est à dire là où l'on envoie, pas seulement dans la frise. -->
{#if trim}
	<p class="trim-notice" role="status">
		<strong>Recadré : {label(trim.endS - trim.startS)} gardées sur {label(durationS)}.</strong>
		{#if fate === 'kept'}
			Le reste ne s'entendra pas, mais il est gardé à part : tu pourras le rétablir depuis la page de l'enregistrement.
		{:else if fate === 'split'}
			Le reste sera proposé, déjà écarté, à l'écran de découpe : tu pourras l'y reprendre, 7 jours au plus.
		{/if}
		« Tout garder » annule le recadrage.
	</p>
{/if}

<style>
	.trim-notice {
		margin: 0;
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--color-warning-border);
		border-radius: var(--radius-md);
		background: var(--color-warning-bg);
		color: var(--color-warning-text);
		font-size: var(--text-sm);
	}
</style>
