<script lang="ts">
	import { goto } from '$app/navigation'
	import { formatDateOnly } from '$lib/date'

	/**
	 * Fichiers longs encore en zone de transit : reprendre une découpe sans renvoyer
	 * l'original. Sur `/upload` pour les imports du groupe, sur `/perso` pour ceux de
	 * l'espace perso — même rattrapage, même rétention.
	 */

	// Les dates arrivent en objets `Date` : SvelteKit les préserve à la sérialisation.
	type ImportRow = {
		id: string
		file_name: string
		duration_s: number | null
		consumed_at: Date | string | null
		created_at: Date | string
	}

	let { imports, disabled = false }: { imports: ImportRow[]; disabled?: boolean } = $props()

	let resuming = $state<string | null>(null)
	let error = $state<string | null>(null)

	/**
	 * Reprend un fichier encore en transit. Une découpe déjà validée doit d'abord être
	 * rouverte côté serveur ; ce qu'elle a produit reste en place.
	 */
	async function resumeImport(row: ImportRow) {
		if (resuming) return
		error = null
		resuming = row.id

		try {
			if (row.consumed_at) {
				const res = await fetch(`/api/imports/${row.id}/redo`, { method: 'POST' })
				if (!res.ok) {
					const payload = await res.json().catch(() => ({}))
					error = payload.error ?? 'Reprise impossible.'
					return
				}
			}
			await goto(`/decoupe/${row.id}`)
		} finally {
			resuming = null
		}
	}

	function formatDate(d: string | Date) {
		return formatDateOnly(d, { day: '2-digit', month: 'short', year: 'numeric' })
	}

	function formatLength(seconds: number | null): string {
		if (seconds === null) return ''
		const m = Math.floor(seconds / 60)
		const s = Math.round(seconds % 60)
		return ` · ${m}:${String(s).padStart(2, '0')}`
	}
</script>

{#if imports.length > 0}
	<section class="imports">
		<h2>Fichiers à découper encore disponibles</h2>
		<p class="hint">
			L'original est conservé une semaine après la découpe : si un segment en
			contenait deux, la reprise évite de renvoyer le fichier.
		</p>
		{#if error}<p class="message-error" role="alert">{error}</p>{/if}
		<ul>
			{#each imports as row (row.id)}
				<li>
					<span class="import-name">
						{row.file_name}
						<span class="hint">
							{formatDate(row.created_at)}{formatLength(row.duration_s)}
							· {row.consumed_at ? 'découpe validée' : 'découpe en attente'}
						</span>
					</span>
					<button
						type="button"
						class="btn btn-secondary btn-sm"
						onclick={() => resumeImport(row)}
						disabled={resuming !== null || disabled}
					>
						{#if resuming === row.id}
							Ouverture…
						{:else if row.consumed_at}
							Refaire la découpe
						{:else}
							Reprendre
						{/if}
					</button>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<style>
	.imports {
		margin-top: 2rem;
		border-top: 1px solid var(--color-border-light);
		padding-top: 1rem;
	}

	.imports h2 {
		font-size: var(--text-sm);
		text-transform: uppercase;
		color: var(--color-text-secondary);
		margin: 0 0 0.25rem;
	}

	.hint {
		font-size: 0.8rem;
		font-weight: 400;
		color: var(--color-text-muted);
		margin: 0;
	}

	.imports > .hint { margin-top: 0.4rem; }

	.imports ul {
		list-style: none;
		margin: 0.75rem 0 0;
		padding: 0;
	}

	.imports li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.45rem 0;
		border-bottom: 1px solid var(--color-border-light);
	}

	.imports li:last-child { border-bottom: 0; }

	.import-name {
		display: flex;
		flex-direction: column;
		font-size: var(--text-sm);
		min-width: 0;
	}
</style>
