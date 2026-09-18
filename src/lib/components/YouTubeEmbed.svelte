<script lang="ts">
	/**
	 * Lecteur YouTube d'un lien cité dans un commentaire.
	 *
	 * Tant qu'on n'a pas cliqué, il n'y a qu'une image : ni iframe, ni script YouTube,
	 * ni cookie — une liste de commentaires en porte parfois plusieurs. L'iframe n'arrive
	 * qu'au clic, et démarre alors seule (`autoplay`). Rien à voir avec `YouTubePlayer`,
	 * qui pilote la vidéo d'une prise et doit en connaître la position à tout instant.
	 */
	import { player as sharedPlayer } from '$lib/player.svelte'
	import { formatTimecode, youtubeEmbedUrl, youtubeThumbnailUrl, youtubeWatchUrl } from '$lib/youtube'

	let {
		videoId,
		startSeconds = 0
	}: {
		videoId: string
		startSeconds?: number
	} = $props()

	let playing = $state(false)

	// La vidéo repart de zéro à chaque lien : un autre commentaire, une autre vidéo.
	$effect(() => {
		videoId
		playing = false
	})

	function start() {
		// Un seul lecteur à la fois dans l'application.
		sharedPlayer.pause()
		playing = true
	}
</script>

<div class="embed">
	{#if playing}
		<iframe
			src={youtubeEmbedUrl(videoId, startSeconds, true)}
			title="Vidéo YouTube"
			loading="lazy"
			allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
			allowfullscreen
		></iframe>
	{:else}
		<button type="button" class="facade" onclick={start} aria-label="Lire la vidéo YouTube">
			<img
				src={youtubeThumbnailUrl(videoId)}
				alt=""
				loading="lazy"
				referrerpolicy="no-referrer"
			/>
			<span class="play" aria-hidden="true">▶</span>
			{#if startSeconds > 0}
				<span class="start" aria-hidden="true">à partir de {formatTimecode(startSeconds)}</span>
			{/if}
		</button>
	{/if}
</div>

<a class="watch-link" href={youtubeWatchUrl(videoId)} target="_blank" rel="noopener noreferrer">
	Ouvrir sur YouTube ↗
</a>

<style>
	.embed {
		position: relative;
		width: 100%;
		max-width: 420px;
		aspect-ratio: 16 / 9;
		margin-top: 0.5rem;
		border-radius: var(--radius-lg);
		overflow: hidden;
		background: #111;
	}

	iframe {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		border: 0;
	}

	.facade {
		position: absolute;
		inset: 0;
		display: block;
		width: 100%;
		height: 100%;
		padding: 0;
		border: none;
		background: none;
		cursor: pointer;
	}

	/* hqdefault est en 4/3 avec des bandes : on recadre plutôt que de les afficher. */
	.facade img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.play {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		display: flex;
		align-items: center;
		justify-content: center;
		width: 3.2rem;
		height: 2.3rem;
		border-radius: var(--radius-lg);
		background: rgb(0 0 0 / 65%);
		color: #fff;
		font-size: 1.1rem;
		line-height: 1;
	}

	.facade:hover .play,
	.facade:focus-visible .play { background: #ff0000; }

	.start {
		position: absolute;
		right: 0.4rem;
		bottom: 0.4rem;
		padding: 0.1rem 0.35rem;
		border-radius: var(--radius-md);
		background: rgb(0 0 0 / 70%);
		color: #fff;
		font-size: var(--text-xs);
	}

	.watch-link {
		display: inline-block;
		margin-top: 0.3rem;
		font-size: var(--text-xs);
		color: var(--color-text-muted);
	}

	.watch-link:hover { color: var(--color-text); }
</style>
