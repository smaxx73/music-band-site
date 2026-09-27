<script lang="ts">
	import { enhance } from '$app/forms'
	import AddressField from '$lib/components/AddressField.svelte'
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte'
	import Icon from '$lib/components/Icon.svelte'
	import { addressCoords, mapUrl, type GroupPlace } from '$lib/places'

	// Lieux du groupe (/group) : ceux qu'on propose à la saisie du lieu d'une session.
	// Consultation pour tout membre, gestion pour l'admin du groupe — comme le nom, le
	// logo et les liens. Les actions sont celles de la page (`?/addPlace`, …).
	let {
		places,
		canManage,
		error = null
	}: {
		places: GroupPlace[]
		canManage: boolean
		/** Erreur renvoyée par l'une des actions des lieux. */
		error?: string | null
	} = $props()

	let editingId = $state<number | null>(null)
	let busy = $state(false)
	let removing = $state<GroupPlace | null>(null)
	let removeForm = $state<HTMLFormElement | null>(null)
	// Recréer le formulaire d'ajout après un ajout réussi : il repart vide, adresse comprise.
	let addFormKey = $state(0)

	function submitting() {
		busy = true
		return async ({ result, update }: { result: { type: string }; update: () => Promise<void> }) => {
			busy = false
			if (result.type === 'success') {
				editingId = null
				addFormKey++
			}
			await update()
		}
	}

	function sessionsLabel(n: number) {
		return n === 0 ? 'Aucune session' : `${n} session${n > 1 ? 's' : ''} ou événement${n > 1 ? 's' : ''}`
	}
</script>

{#if places.length === 0}
	<p class="empty">
		Aucun lieu pour l'instant.{#if canManage} Ajoutez ceux où le groupe joue souvent : ils seront
			proposés à la création d'une session.{/if}
	</p>
{:else}
	<ul class="places">
		{#each places as place (place.id)}
			<li class="place">
				{#if editingId === place.id}
					<form method="POST" action="?/updatePlace" class="place-form" use:enhance={submitting}>
						<input type="hidden" name="place_id" value={place.id} />
						<label class="form-label">
							Étiquette
							<input class="form-input" name="label" value={place.label} required maxlength="200" disabled={busy} />
						</label>
						<AddressField initial={place.address} disabled={busy} />
						<p class="hint">
							Renommer le lieu renomme aussi les sessions et événements qui le portent.
						</p>
						<div class="form-actions">
							<button type="submit" class="btn btn-primary btn-sm" disabled={busy}>
								{busy ? 'Enregistrement…' : 'Enregistrer'}
							</button>
							<button type="button" class="btn btn-ghost btn-sm" onclick={() => (editingId = null)} disabled={busy}>
								Annuler
							</button>
						</div>
					</form>
				{:else}
					{@const map = mapUrl(addressCoords(place.address))}
					<div class="place-text">
						<span class="place-label"><Icon name="pin" size="0.85rem" /> {place.label}</span>
						{#if place.address}
							<span class="place-address">
								{place.address.label}
								{#if map}<a href={map} target="_blank" rel="noopener noreferrer">Carte</a>{/if}
							</span>
						{:else}
							<span class="place-address muted">Sans adresse</span>
						{/if}
						<span class="place-uses">{sessionsLabel(place.uses)}</span>
					</div>
					{#if canManage}
						<div class="place-actions">
							<button class="btn btn-ghost btn-sm" onclick={() => (editingId = place.id)} disabled={busy}>
								Modifier
							</button>
							<button class="btn btn-ghost btn-sm" onclick={() => (removing = place)} disabled={busy}>
								Retirer
							</button>
						</div>
					{/if}
				{/if}
			</li>
		{/each}
	</ul>
{/if}

{#if error}<p class="error" role="alert">{error}</p>{/if}

{#if canManage}
	{#key addFormKey}
		<form method="POST" action="?/addPlace" class="place-form add" use:enhance={submitting}>
			<h3>Ajouter un lieu</h3>
			<label class="form-label">
				Étiquette
				<input class="form-input" name="label" placeholder="ex : Chez Élise, Studio du Hangar" required maxlength="200" disabled={busy} />
			</label>
			<AddressField disabled={busy} />
			<div class="form-actions">
				<button type="submit" class="btn btn-primary btn-sm" disabled={busy}>Ajouter</button>
			</div>
		</form>
	{/key}

	<!-- Retrait : un seul formulaire, envoyé une fois la confirmation donnée. -->
	<form method="POST" action="?/removePlace" bind:this={removeForm} use:enhance={submitting} hidden>
		<input type="hidden" name="place_id" value={removing?.id ?? ''} />
	</form>
	<ConfirmDialog
		open={removing !== null}
		level="warning"
		title="Retirer ce lieu ?"
		message={removing
			? `« ${removing.label} » ne sera plus proposé à la saisie d'un lieu. ${
					removing.uses > 0
						? `Les ${removing.uses} sessions et événements qui le portent gardent ce nom, mais perdent son adresse.`
						: ''
				}`
			: ''}
		confirmLabel="Retirer le lieu"
		{busy}
		onConfirm={() => {
			removeForm?.requestSubmit()
			removing = null
		}}
		onCancel={() => (removing = null)}
	/>
{/if}

<style>
	.places {
		list-style: none;
		margin: 0 0 1rem;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.place {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.55rem 0.65rem;
		border: 1px solid var(--color-border-light);
		border-radius: var(--radius-md);
	}

	.place-text {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}

	.place-label { font-weight: 600; display: inline-flex; align-items: center; gap: 0.3rem; }

	.place-address,
	.place-uses {
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		overflow-wrap: anywhere;
	}

	.place-address a { color: inherit; margin-left: 0.3rem; }
	.place-uses { font-size: var(--text-xs); color: var(--color-text-muted); }
	.muted { font-style: italic; color: var(--color-text-muted); }

	.place-actions { display: flex; gap: 0.25rem; flex-shrink: 0; }

	.place-form {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.place-form.add {
		padding: 0.9rem;
		border: 1px dashed var(--color-border);
		border-radius: var(--radius-md);
	}

	h3 { margin: 0; font-size: var(--text-sm); }

	.form-actions { display: flex; gap: 0.5rem; }

	.hint { margin: 0; font-size: var(--text-xs); color: var(--color-text-muted); }
	.empty { color: var(--color-text-muted); font-size: var(--text-sm); }
	.error { color: var(--color-error); font-size: var(--text-sm); }

	@media (max-width: 640px) {
		.place { flex-direction: column; }
	}
</style>
