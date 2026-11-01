<script lang="ts">
	import { formatTimecode } from '$lib/youtube'
	import type { AudioTrim } from '$lib/types'

	let { trim, durationS }: { trim: AudioTrim | null; durationS: number } = $props()

	// Arrondi : la durée vient du chronomètre ou du fichier, à quelques dixièmes près.
	const label = (seconds: number) => formatTimecode(Math.round(seconds))
</script>

<!-- Ce qui est écarté ne part pas et ne se retrouve plus : à dire là où l'on envoie. -->
{#if trim}
	<p class="trim-notice" role="status">
		<strong>Recadré : {label(trim.endS - trim.startS)} gardées sur {label(durationS)}.</strong>
		Le reste ne sera pas envoyé et ne pourra pas être récupéré. « Tout garder » annule le recadrage.
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
