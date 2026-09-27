<script lang="ts">
	import Icon from '$lib/components/Icon.svelte'
	import { SESSION_PHOTO_ACCEPT, SESSION_PHOTO_MAX_BYTES, SESSION_PHOTO_VEIL } from '$lib/session-photo'

	// Photo de bandeau dans le formulaire d'édition d'une session. Rien ne part d'ici :
	// le fichier choisi, le retrait et le voile attendent « Enregistrer », et « Annuler »
	// les abandonne comme le reste du formulaire. L'aperçu est le bandeau lui-même,
	// rendu au-dessus du formulaire par `SessionEditor`.
	let {
		hasPhoto,
		file = $bindable(null),
		removed = $bindable(false),
		veil = $bindable(SESSION_PHOTO_VEIL.default),
		disabled = false
	}: {
		/** La session a une photo en base. */
		hasPhoto: boolean
		file?: File | null
		removed?: boolean
		veil?: number
		disabled?: boolean
	} = $props()

	let error = $state<string | null>(null)
	let fileInput = $state<HTMLInputElement | null>(null)

	const showsPhoto = $derived(file !== null || (hasPhoto && !removed))

	function pick(event: Event) {
		const input = event.currentTarget as HTMLInputElement
		const picked = input.files?.[0]
		input.value = ''
		if (!picked) return
		// Vérifié tout de suite plutôt qu'à l'envoi : on saurait sinon après avoir tout rempli.
		if (picked.size > SESSION_PHOTO_MAX_BYTES) {
			error = "L'image ne peut pas dépasser 8 Mo."
			return
		}
		error = null
		file = picked
		removed = false
	}

	function remove() {
		file = null
		removed = hasPhoto
		error = null
	}
</script>

<fieldset class="photo-field">
	<legend class="form-label">Photo du bandeau</legend>
	<input
		bind:this={fileInput}
		type="file"
		accept={SESSION_PHOTO_ACCEPT}
		class="file-input"
		onchange={pick}
		{disabled}
	/>

	{#if showsPhoto}
		<label class="veil">
			<span>Voile sombre <span class="value">{veil} %</span></span>
			<input
				type="range"
				bind:value={veil}
				min={SESSION_PHOTO_VEIL.min}
				max={SESSION_PHOTO_VEIL.max}
				step={SESSION_PHOTO_VEIL.step}
				{disabled}
			/>
		</label>
		<div class="actions">
			<button type="button" class="btn btn-secondary btn-sm" onclick={() => fileInput?.click()} {disabled}>
				<Icon name="upload" size="0.85rem" /> Remplacer
			</button>
			<!-- Pas de confirmation : rien n'est retiré avant « Enregistrer ». -->
			<button type="button" class="btn btn-ghost btn-sm" onclick={remove} {disabled}>
				<Icon name="trash" size="0.85rem" /> Retirer
			</button>
		</div>
	{:else}
		<div class="actions">
			<button type="button" class="btn btn-secondary btn-sm" onclick={() => fileInput?.click()} {disabled}>
				<Icon name="image" size="0.85rem" /> Choisir une photo
			</button>
			{#if removed}<span class="hint">Retirée à l'enregistrement.</span>{/if}
		</div>
	{/if}
	<p class="hint">
		PNG, JPEG, WebP ou GIF, 8 Mo au plus. La photo est recadrée au centre au format du bandeau.
	</p>
	{#if error}<p class="message-error" role="alert">{error}</p>{/if}
</fieldset>

<style>
	.photo-field {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin: 0;
		padding: 0;
		border: 0;
		min-width: 0;
	}

	legend { padding: 0; margin-bottom: 0.25rem; }

	.veil {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
	}

	.veil input { width: 100%; max-width: 22rem; accent-color: var(--color-accent); }

	.value { font-variant-numeric: tabular-nums; color: var(--color-text); }

	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}

	.actions .btn { gap: 0.35rem; }

	.hint { margin: 0; font-size: var(--text-xs); color: var(--color-text-muted); }

	.file-input {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}
</style>
