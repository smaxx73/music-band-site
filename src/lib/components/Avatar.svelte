<script lang="ts" module>
	/** Deux initiales du nom affiché : « Julie M. » → « JM ». */
	export function initialsOf(name: string): string {
		return name
			.split(/\s+/)
			.map((part) => part[0] ?? '')
			.join('')
			.slice(0, 2)
			.toUpperCase()
	}
</script>

<script lang="ts">
	// Pastille ronde d'un membre : sa photo de profil s'il en a une, ses initiales sinon.
	// Décorative — le nom est toujours écrit à côté —, donc masquée aux lecteurs d'écran.
	// Couleurs réglables par l'appelant (`--avatar-bg`, `--avatar-fg`), taille par `size`.
	import { avatarUrl } from '$lib/types'

	let {
		userId,
		name,
		version,
		size = '2rem',
		full = false
	}: {
		userId: number | null | undefined
		name: string
		version: number | null | undefined
		size?: string
		/** La photo 256 px plutôt que la vignette 96 px : au-delà d'environ 48 px affichés. */
		full?: boolean
	} = $props()

	// Une image qui ne charge pas (compte hors de portée, photo retirée entre-temps)
	// laisse la place aux initiales plutôt qu'à une icône d'image cassée.
	let failed = $state(false)
	const src = $derived(
		userId != null && version != null && !failed ? avatarUrl(userId, version, full ? 'full' : 'thumb') : null
	)

	$effect(() => {
		void version
		failed = false
	})
</script>

<span class="avatar" style:--avatar-size={size} aria-hidden="true">
	{#if src}
		<img {src} alt="" loading="lazy" decoding="async" onerror={() => (failed = true)} />
	{:else}
		{initialsOf(name)}
	{/if}
</span>

<style>
	.avatar {
		flex-shrink: 0;
		display: inline-grid;
		place-items: center;
		width: var(--avatar-size);
		height: var(--avatar-size);
		border-radius: 50%;
		overflow: hidden;
		background: var(--avatar-bg, var(--color-accent-light));
		color: var(--avatar-fg, var(--color-accent));
		/* Initiales : un glyphe proportionnel à la pastille, pas un palier de texte. */
		font-size: calc(var(--avatar-size) * 0.38);
		font-weight: 700;
		line-height: 1;
		user-select: none;
	}

	img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
</style>
