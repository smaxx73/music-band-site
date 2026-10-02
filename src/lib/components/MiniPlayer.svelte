<script lang="ts">
	import { player } from '$lib/player.svelte'
	import Icon from '$lib/components/Icon.svelte'
	import SongCover from '$lib/components/SongCover.svelte'

	let el = $state<HTMLAudioElement | null>(null)

	// L'élément est monté en permanence, même sans piste : une waveform de page peut
	// s'y attacher dès son montage, sans dépendre de l'ordre de rendu.
	$effect(() => {
		player.media = el
		return () => { player.media = null }
	})

	// Masquée tant qu'une waveform de la page pilote déjà le même média.
	const visible = $derived(player.track !== null && player.viewCount === 0)

	function validDuration(value: number | null | undefined) {
		return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
	}

	const total = $derived(validDuration(player.duration) || validDuration(player.track?.durationS))
	const progress = $derived(total > 0 ? Math.max(0, Math.min(100, (player.currentTime / total) * 100)) : 0)

	// La sidebar et, sur mobile où la barre est fixe, la fin du contenu s'arrêtent
	// au-dessus d'elle : sa hauteur réelle est publiée sur le body (`--mini-player-h`).
	let barHeight = $state(0)
	$effect(() => {
		if (!visible || barHeight === 0) return
		document.body.style.setProperty('--mini-player-h', `${barHeight}px`)
		return () => document.body.style.removeProperty('--mini-player-h')
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

	function syncTime() {
		const time = el?.currentTime
		if (typeof time === 'number' && Number.isFinite(time)) player.currentTime = Math.max(0, time)
	}

	function syncDuration() {
		const duration = el?.duration
		if (typeof duration === 'number' && Number.isFinite(duration) && duration > 0) {
			player.duration = duration
		}
	}
</script>

<audio
	bind:this={el}
	preload="metadata"
	onplay={() => (player.isPlaying = true)}
	onpause={() => (player.isPlaying = false)}
	ontimeupdate={syncTime}
	onseeking={syncTime}
	onseeked={syncTime}
	onloadedmetadata={syncDuration}
	ondurationchange={syncDuration}
	onended={() => player.handleEnded()}
></audio>

{#if visible && player.track}
	<!-- Comme la mini-barre d'une plateforme d'écoute : la pochette du morceau, ce qui
	     joue, puis les commandes. -->
	<div class="mini-player" bind:offsetHeight={barHeight}>
		<a href="/recording/{player.track.recordingId}" class="mini-cover" tabindex="-1" aria-hidden="true">
			<SongCover songId={player.track.songId} title={player.track.songTitle} size={38} />
		</a>

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

		<button
			class="mini-btn mini-play"
			onclick={() => player.toggle()}
			title={player.isPlaying ? 'Pause' : 'Lecture'}
			aria-label={player.isPlaying ? 'Pause' : 'Lecture'}
		><Icon name={player.isPlaying ? 'pause' : 'play'} size="1rem" /></button>

		{#if player.queue.length > 0}
			<button
				class="mini-btn mini-next"
				onclick={() => player.next()}
				title="Prise suivante ({player.queue.length} en attente)"
				aria-label="Prise suivante"
			><Icon name="skip-forward" size="0.95rem" /></button>
		{/if}

		<button class="mini-btn mini-close" onclick={() => player.close()} title="Fermer le lecteur">
			<Icon name="close" size="0.9rem" />
		</button>
	</div>
{/if}

<style>
	/* Collée au bas de la fenêtre, qui défile : dernière du shell, elle ne recouvre
	   jamais la fin du contenu. */
	.mini-player {
		position: sticky;
		bottom: 0;
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

	/* Le ▶ rond orange des en-têtes et des lecteurs, à l'échelle de la barre. */
	.mini-play {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		background: var(--color-accent);
		color: #fff;
		font-size: 0.9rem;
	}

	.mini-cover {
		display: flex;
		flex-shrink: 0;
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.mini-play:hover { filter: brightness(1.08); }

	.mini-close {
		width: 26px;
		height: 26px;
		font-size: var(--text-xs);
	}

	.mini-next {
		width: 30px;
		height: 30px;
	}

	.mini-close:hover,
	.mini-next:hover { background: rgba(255, 255, 255, 0.1); color: #fff; }

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
		font-size: var(--text-sm);
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
		font-size: var(--text-2xs);
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

	/* Fixée juste au-dessus de la barre d'actions (enregistrement/upload/notifications). */
	@media (max-width: 640px) {
		.mini-player {
			position: fixed;
			left: 0;
			right: 0;
			bottom: var(--footer-actions-h);
			padding: 0.45rem 0.7rem;
		}
	}
</style>
