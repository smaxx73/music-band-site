<script lang="ts" module>
	export type CatalogTrack = {
		id: number
		title: string
		artist: string
		album: string | null
		duration_s: number | null
		cover_url: string | null
		release_year: number | null
	}
</script>

<script lang="ts">
	import { onMount, untrack } from 'svelte'
	import Icon from '$lib/components/Icon.svelte'

	// Chercher une reprise dans le catalogue Deezer. Choisir un résultat rend son détail
	// (année comprise) à `onPick`. Avec `name`, le composant est aussi un champ de
	// formulaire : il porte l'id du titre choisi, pour que l'action serveur importe la
	// pochette de l'album à l'enregistrement.
	let {
		initialQuery = '',
		name = null,
		label = 'Rechercher une reprise sur Deezer',
		autoSearch = false,
		onPick
	}: {
		initialQuery?: string
		name?: string | null
		label?: string
		/**
		 * Lance `initialQuery` à l'ouverture. Pas dans un formulaire d'édition, qui
		 * interrogerait Deezer à chaque fiche ouverte sans qu'on ait rien demandé.
		 */
		autoSearch?: boolean
		/** `root` : l'élément du composant, pour retrouver le formulaire qui l'accueille. */
		onPick: (track: CatalogTrack, root: HTMLElement) => void
	} = $props()

	let root = $state<HTMLElement | null>(null)

	const inputId = `catalog-${Math.random().toString(36).slice(2, 8)}`

	// Point de départ seulement : ensuite, la recherche appartient à ce qu'on tape.
	let query = $state(untrack(() => initialQuery))
	let results = $state<CatalogTrack[]>([])
	let searching = $state(false)
	let picking = $state<number | null>(null)
	let error = $state<string | null>(null)
	let searched = $state(false)
	let picked = $state<CatalogTrack | null>(null)

	// Une requête par pause de frappe, pas par touche ; la dernière gagne.
	let timer: ReturnType<typeof setTimeout> | null = null
	let lastRequest = 0

	onMount(() => {
		if (autoSearch) search()
	})

	function onInput() {
		if (timer) clearTimeout(timer)
		timer = setTimeout(search, 350)
	}

	async function search() {
		const q = query.trim()
		if (q.length < 2) {
			results = []
			searched = false
			return
		}
		const request = ++lastRequest
		searching = true
		error = null
		try {
			const res = await fetch(`/api/catalog/search?q=${encodeURIComponent(q)}`)
			const body = (await res.json().catch(() => ({}))) as { results?: CatalogTrack[]; error?: string }
			if (request !== lastRequest) return
			if (!res.ok) {
				error = body.error ?? `Erreur ${res.status}.`
				results = []
			} else {
				results = body.results ?? []
			}
			searched = true
		} catch {
			if (request === lastRequest) error = 'Erreur réseau.'
		} finally {
			if (request === lastRequest) searching = false
		}
	}

	async function pick(track: CatalogTrack) {
		picking = track.id
		error = null
		try {
			const res = await fetch(`/api/catalog/tracks/${track.id}`)
			const detail = (await res.json().catch(() => null)) as (CatalogTrack & { error?: string }) | null
			if (!res.ok || !detail) {
				error = detail?.error ?? `Erreur ${res.status}.`
				return
			}
			picked = detail
			results = []
			searched = false
			if (root) onPick(detail, root)
		} catch {
			error = 'Erreur réseau.'
		} finally {
			picking = null
		}
	}

	function formatDuration(s: number | null) {
		if (!s) return ''
		return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
	}
</script>

<div class="catalog-search" bind:this={root}>
	<label class="catalog-label" for={inputId}>
		<Icon name="search" size="0.85rem" /> {label}
	</label>
	<input
		id={inputId}
		class="form-input"
		type="search"
		bind:value={query}
		oninput={onInput}
		onkeydown={(e) => {
			// Dans un formulaire, Entrée ne doit pas l'envoyer : elle relance la recherche.
			if (e.key === 'Enter') {
				e.preventDefault()
				search()
			}
		}}
		placeholder="Titre, artiste…"
		autocomplete="off"
	/>

	{#if error}<p class="catalog-error" role="alert">{error}</p>{/if}

	{#if searching}
		<p class="catalog-hint">Recherche…</p>
	{:else if searched && results.length === 0 && !error}
		<p class="catalog-hint">Aucun titre trouvé.</p>
	{/if}

	{#if results.length > 0}
		<!-- L'album départage les versions : une compilation arrive souvent avant l'original. -->
		<ul class="catalog-results">
			{#each results as track (track.id)}
				<li>
					<button type="button" class="catalog-result" onclick={() => pick(track)} disabled={picking !== null}>
						{#if track.cover_url}
							<img src={track.cover_url} alt="" loading="lazy" referrerpolicy="no-referrer" />
						{:else}
							<span class="no-cover"></span>
						{/if}
						<span class="result-text">
							<span class="result-title">{track.title}</span>
							<span class="result-meta">{track.artist}{#if track.album} · {track.album}{/if}</span>
						</span>
						<span class="result-duration">
							{picking === track.id ? '…' : formatDuration(track.duration_s)}
						</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}

	{#if name && picked}
		<input type="hidden" {name} value={picked.id} />
		<p class="catalog-picked">
			{#if picked.cover_url}<img src={picked.cover_url} alt="" referrerpolicy="no-referrer" />{/if}
			<span>Pochette de l'album importée à l'enregistrement.</span>
			<button type="button" class="btn-link btn-link-muted" onclick={() => (picked = null)}>Ne pas l'importer</button>
		</p>
	{/if}
</div>

<style>
	.catalog-search {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		padding: 0.75rem;
		border: 1px dashed var(--color-border);
		border-radius: var(--radius-lg);
		background: var(--color-bg-subtle);
	}

	.catalog-label {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--color-text-secondary);
	}

	.catalog-hint,
	.catalog-error {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}

	.catalog-error { color: var(--color-error); }

	.catalog-results {
		list-style: none;
		margin: 0;
		padding: 0;
		max-height: 18rem;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.catalog-result {
		width: 100%;
		display: grid;
		grid-template-columns: 40px minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.65rem;
		padding: 0.35rem;
		border: none;
		border-radius: var(--radius-md);
		background: none;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.catalog-result:hover:not(:disabled),
	.catalog-result:focus-visible { background: var(--color-bg-muted); }
	.catalog-result:disabled { cursor: wait; }

	.catalog-result img,
	.no-cover {
		width: 40px;
		height: 40px;
		border-radius: var(--radius-sm);
		object-fit: cover;
		background: var(--color-bg-muted);
	}

	.result-text {
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.result-title,
	.result-meta {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.result-title { font-weight: 600; font-size: var(--text-sm); }
	.result-meta { font-size: var(--text-xs); color: var(--color-text-muted); }

	.result-duration {
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
		font-variant-numeric: tabular-nums;
	}

	.catalog-picked {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 0;
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
	}

	.catalog-picked img {
		width: 32px;
		height: 32px;
		border-radius: var(--radius-sm);
	}

</style>
