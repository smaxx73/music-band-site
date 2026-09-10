<script lang="ts">
	import AudioPlayer from '$lib/components/AudioPlayer.svelte'
	import { player } from '$lib/player.svelte'

	let {
		recordingId,
		durationS = null,
		seekRequest = null
	}: {
		recordingId: number
		/** Durée connue de la ligne : évite d'attendre les peaks pour afficher le total. */
		durationS?: number | null
		/** Demande de seek émise par le parent (clic sur le timestamp d'un commentaire). */
		seekRequest?: { seconds: number; token: number } | null
	} = $props()

	// Tant que cette waveform est montée, la barre du bas se retire : elle ferait
	// doublon avec les contrôles affichés ici.
	$effect(() => {
		player.attachView()
		return () => player.detachView()
	})

	let peaks = $state<number[]>([])
	let peaksDuration = $state<number | null>(null)
	let loading = $state(true)
	let loadError = $state<string | null>(null)

	// Le composant n'est monté que lorsque la ligne est dépliée : les peaks ne sont
	// demandés qu'à ce moment-là, prise par prise.
	$effect(() => {
		const id = recordingId
		let cancelled = false

		loading = true
		loadError = null

		fetch(`/api/recordings/${id}/peaks`)
			.then(async (res) => {
				const json = await res.json()
				if (cancelled) return
				if (!res.ok) {
					loadError = json.error ?? 'Erreur.'
					return
				}
				peaks = json.peaks as number[]
				peaksDuration = json.duration as number | null
			})
			.catch(() => {
				if (!cancelled) loadError = 'Erreur réseau.'
			})
			.finally(() => {
				if (!cancelled) loading = false
			})

		return () => { cancelled = true }
	})

	const track = $derived({
		id: recordingId,
		src: `/audio/${recordingId}.mp3`,
		peaks,
		duration: durationS ?? peaksDuration ?? undefined
	})
</script>

<div class="inline-player">
	{#if loadError}
		<p class="inline-msg error">{loadError}</p>
	{:else if loading}
		<p class="inline-msg">Chargement du lecteur…</p>
	{:else}
		<AudioPlayer track={track} media={player.media} height={56} {seekRequest} />
		<a class="inline-link" href="/recording/{recordingId}">Ouvrir la page lecteur →</a>
	{/if}
</div>

<style>
	.inline-player {
		padding: 0.7rem 0.2rem 0.9rem;
	}

	.inline-msg {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}

	.inline-msg.error { color: var(--color-error); }

	.inline-link {
		display: inline-block;
		margin-top: 0.6rem;
		font-size: var(--text-xs);
		color: var(--color-text-muted);
	}
</style>
