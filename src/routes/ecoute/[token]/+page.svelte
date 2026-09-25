<script lang="ts">
	// Page d'écoute publique : ce que voit quelqu'un qui n'a pas de compte. Pas de
	// coquille applicative — il n'a nulle part où aller dans l'application —, juste de
	// quoi écouter, télécharger, et savoir jusqu'à quand.
	import type { PageData } from './$types'
	import { page } from '$app/state'
	import { formatDateOnly } from '$lib/date'
	import MediaPlayer from '$lib/components/MediaPlayer.svelte'
	import Icon from '$lib/components/Icon.svelte'
	import LegalLinks from '$lib/components/LegalLinks.svelte'

	let { data }: { data: PageData } = $props()

	const audioSrc = $derived(`/ecoute/${page.params.token}/audio`)

	const longDate = { day: 'numeric', month: 'long', year: 'numeric' } as const
	const context = $derived(
		[
			data.group_name,
			data.take !== null ? `Prise ${data.take}` : null,
			data.session_date
				? formatDateOnly(data.session_date, longDate)
				: data.created_at
					? formatDateOnly(data.created_at, longDate)
					: null
		].filter(Boolean).join(' · ')
	)
</script>

<svelte:head>
	<title>{data.title}{data.group_name ? ` — ${data.group_name}` : ''}</title>
	<meta name="robots" content="noindex, nofollow" />
	<meta name="referrer" content="no-referrer" />
	<!-- Aperçu du lien dans une messagerie : titre, contexte, logo du groupe. Rien de plus
	     que ce que la page montre déjà. -->
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content="BandStash" />
	<meta property="og:title" content={data.title} />
	{#if context}<meta property="og:description" content={context} />{/if}
	<meta property="og:url" content={data.page_url} />
	<meta property="og:image" content={data.preview_image} />
	<meta property="og:image:type" content="image/jpeg" />
	<meta property="og:image:width" content="512" />
	<meta property="og:image:height" content="512" />
	<meta property="og:image:alt" content={data.group_name ? `Logo de ${data.group_name}` : 'BandStash'} />
	<meta name="twitter:card" content="summary" />
</svelte:head>

<main class="listen">
	<a href="/accueil" class="brand">
		<img src="/brand/bandstash-mark-simple.svg" alt="" width="20" height="20" />
		BandStash
	</a>

	<section class="card">
		<h1>{data.title}</h1>
		{#if context}<p class="context">{context}</p>{/if}

		<div class="player">
			<MediaPlayer
				trackId="ecoute"
				{audioSrc}
				peaks={data.peaks}
				duration={data.duration_s}
			/>
		</div>

		<div class="actions">
			<a href="{audioSrc}?download" class="btn btn-secondary btn-sm" download>
				<Icon name="download" size="0.9rem" /> Télécharger le fichier audio
			</a>
		</div>

		<p class="expiry">Lien valable jusqu'au {formatDateOnly(data.expires_at, longDate)}.</p>
	</section>

	<LegalLinks />
</main>

<style>
	.listen {
		max-width: 40rem;
		margin: 0 auto;
		padding: 2rem 1rem 3rem;
	}

	.brand {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 1.5rem;
		font-weight: 600;
		color: inherit;
		text-decoration: none;
	}

	.card {
		background: var(--color-bg-subtle);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-xl);
		padding: 1.25rem;
	}

	h1 {
		font-size: 1.4rem;
		margin: 0 0 0.25rem;
		overflow-wrap: anywhere;
	}

	.context {
		margin: 0 0 1rem;
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
	}

	.player { margin-bottom: 1rem; }

	.actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }

	.expiry {
		margin: 1rem 0 0;
		font-size: var(--text-xs);
		color: var(--color-text-muted);
	}

	@media (max-width: 640px) {
		.listen { padding: 1rem 0.75rem 2rem; }
		.card { padding: 1rem 0.8rem; }
		.actions > * { flex: 1 1 auto; justify-content: center; }
	}
</style>
