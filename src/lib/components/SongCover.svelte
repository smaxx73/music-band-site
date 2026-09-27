<script lang="ts">
	import { isPlaceholderSongTitle, songHue } from '$lib/songs'

	let {
		songId,
		title,
		size = null,
		coverVersion = undefined
	}: {
		songId: number
		title: string
		/** En px ; sans taille, la pochette remplit son conteneur (en-tête). */
		size?: number | null
		/**
		 * Version de la pochette déposée (`?v=`, cache long) ; `null` : pas de pochette,
		 * aucune requête. Non renseignée (mini-lecteur, qui ne la connaît pas) : on tente
		 * l'URL sans version, en cache court, et le dégradé reste si elle n'existe pas.
		 */
		coverVersion?: number | null
	} = $props()

	// Pas d'image de pochette en base : un dégradé dans la teinte du morceau, qui se
	// reconnaît ainsi avant d'être lu.
	const hue = $derived(songHue(songId))

	// Une vignette légère pour les listes, l'image entière pour un en-tête.
	const coverUrl = $derived(
		coverVersion === null
			? null
			: `/api/songs/${songId}/cover?size=${size !== null && size <= 160 ? 'thumb' : 'full'}` +
				(coverVersion === undefined ? '' : `&v=${coverVersion}`)
	)

	let failed = $state(false)
	$effect(() => {
		void coverUrl
		failed = false
	})

	// Un morceau « À nommer — … » commencerait par « À » comme tous ses semblables.
	const initial = $derived(
		isPlaceholderSongTitle(title) ? '?' : (title.match(/[\p{L}\p{N}]/u)?.[0] ?? '♪').toLocaleUpperCase('fr')
	)
</script>

<span
	class="song-cover"
	class:fill={size === null}
	style="--hue: {hue}; {size === null ? '' : `--size: ${size}px`}"
	aria-hidden="true"
><span class="initial">{initial}</span>{#if coverUrl && !failed}<img
			src={coverUrl}
			alt=""
			loading="lazy"
			decoding="async"
			onerror={() => (failed = true)}
		/>{/if}</span>

<style>
	/* Luminosités basses : le blanc de l'initiale doit rester lisible sur toutes les
	   teintes, jaunes compris. */
	/* Le dégradé est toujours dessous : sans pochette, ou tant qu'elle charge, il tient
	   la place — l'image le recouvre quand elle arrive. */
	.song-cover {
		position: relative;
		overflow: hidden;
		width: var(--size);
		height: var(--size);
		flex-shrink: 0;
		display: grid;
		place-items: center;
		container-type: size;
		border-radius: var(--radius-lg);
		background: linear-gradient(
			135deg,
			hsl(var(--hue) 45% 48%),
			hsl(calc(var(--hue) + 35) 50% 30%)
		);
		color: #fff;
		font-weight: 700;
		line-height: 1;
		letter-spacing: -0.02em;
		box-shadow: 0 1px 2px rgba(44, 43, 40, 0.18);
		user-select: none;
	}

	.song-cover.fill {
		width: 100%;
		height: 100%;
		border-radius: inherit;
		box-shadow: none;
	}

	/* Initiale proportionnelle à la pochette, quelle que soit la façon de la dimensionner. */
	.initial { font-size: 42cqmin; }

	img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
</style>
