<script lang="ts">
	import { player } from '$lib/player.svelte'

	let el = $state<HTMLAudioElement | null>(null)

	// L'élément est monté en permanence, même sans piste : une waveform de page peut
	// s'y attacher dès son montage, sans dépendre de l'ordre de rendu.
	$effect(() => {
		player.media = el
		return () => { player.media = null }
	})

	// Masquée tant qu'une waveform de la page pilote déjà le même média.
	const visible = $derived(player.track !== null && player.viewCount === 0)

	const total = $derived(player.duration || player.track?.durationS || 0)
	const progress = $derived(total > 0 ? (player.currentTime / total) * 100 : 0)

	// Sur mobile la barre est en position fixe : le bas du contenu passerait dessous.
	// Même approche que le tiroir de navigation, qui pose déjà un style sur le body.
	$effect(() => {
		if (!visible) return
		document.body.classList.add('has-mini-player')
		return () => document.body.classList.remove('has-mini-player')
	})

	function formatTime(s: number) {
		if (!isFinite(s)) return '0:00'
		const m = Math.floor(s / 60)
		const sec = Math.floor(s % 60)
		return `${m}:${String(sec).padStart(2, '0')}`
	}

	function scrub(event: Event) {
		const pct = parseFloat((event.target as HTMLInputElement).value)
		if (total > 0) player.seek((pct / 100) * total)
	}
</script>

<audio
	bind:this={el}
	preload="metadata"
	onplay={() => (player.isPlaying = true)}
	onpause={() => (player.isPlaying = false)}
	ontimeupdate={() => (player.currentTime = el?.currentTime ?? 0)}
	onloadedmetadata={() => (player.duration = el?.duration ?? 0)}
	onended={() => (player.isPlaying = false)}
></audio>

{#if visible && player.track}
	<div class="mini-player">
		<button
			class="mini-btn mini-play"
			onclick={() => player.toggle()}
			title={player.isPlaying ? 'Pause' : 'Lecture'}
		>{player.isPlaying ? '⏸' : '▶'}</button>

		<div class="mini-body">
			<div class="mini-title">
				<a href="/recording/{player.track.recordingId}">{player.track.songTitle}</a>
				<span class="mini-take">prise {player.track.take}</span>
			</div>
			<div class="mini-progress">
				<span class="mini-time">{formatTime(player.currentTime)}</span>
				<input
					type="range"
					min="0"
					max="100"
					step="0.1"
					value={progress}
					oninput={scrub}
					aria-label="Position de lecture"
					class="mini-seek"
					style="--progress: {progress}%"
				/>
				<span class="mini-time">{formatTime(total)}</span>
			</div>
		</div>

		<button class="mini-btn mini-close" onclick={() => player.close()} title="Fermer le lecteur">✕</button>
	</div>
{/if}

<style>
	.mini-player {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 1rem;
		background: var(--color-ink);
		border-top: 1px solid rgba(255, 255, 255, 0.08);
		z-index: 95;
	}

	.mini-btn {
		flex-shrink: 0;
		background: transparent;
		border: none;
		color: var(--color-mid);
		cursor: pointer;
		border-radius: var(--radius-md);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.mini-play {
		width: 32px;
		height: 32px;
		background: var(--color-accent);
		color: #fff;
		font-size: 0.9rem;
	}

	.mini-play:hover { filter: brightness(1.08); }

	.mini-close {
		width: 26px;
		height: 26px;
		font-size: 0.8rem;
	}

	.mini-close:hover { background: rgba(255, 255, 255, 0.1); color: #fff; }

	.mini-body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.mini-title {
		display: flex;
		align-items: baseline;
		gap: 0.4rem;
		font-size: 0.78rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.mini-title a {
		color: #fff;
		font-weight: 600;
		text-decoration: none;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.mini-title a:hover { text-decoration: underline; }

	.mini-take { color: var(--color-mid); flex-shrink: 0; }

	.mini-progress {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.mini-time {
		font-size: 0.68rem;
		color: var(--color-mid);
		font-variant-numeric: tabular-nums;
		flex-shrink: 0;
	}

	/* Piste remplie jusqu'à la position courante, sans JS de dessin */
	.mini-seek {
		flex: 1;
		min-width: 0;
		height: 4px;
		-webkit-appearance: none;
		appearance: none;
		background: linear-gradient(
			to right,
			var(--color-accent) var(--progress),
			rgba(255, 255, 255, 0.18) var(--progress)
		);
		border-radius: 2px;
		cursor: pointer;
	}

	.mini-seek::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 11px;
		height: 11px;
		border-radius: 50%;
		background: #fff;
	}

	.mini-seek::-moz-range-thumb {
		width: 11px;
		height: 11px;
		border: none;
		border-radius: 50%;
		background: #fff;
	}

	/* Le shell ne scrolle plus : la barre est fixée au bas de l'écran */
	@media (max-width: 640px) {
		.mini-player {
			position: fixed;
			left: 0;
			right: 0;
			bottom: 0;
			padding: 0.45rem 0.7rem;
		}
	}
</style>
