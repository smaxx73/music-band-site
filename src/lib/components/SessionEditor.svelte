<script lang="ts">
	import { formatDateOnly, toDateOnly } from '$lib/date'
	import MembersInput from '$lib/components/MembersInput.svelte'
	import MediaHeader from '$lib/components/MediaHeader.svelte'
	import Icon from '$lib/components/Icon.svelte'
	import SessionCover from '$lib/components/SessionCover.svelte'
	import SessionPhotoAdd from '$lib/components/SessionPhotoAdd.svelte'
	import SessionPhotoField from '$lib/components/SessionPhotoField.svelte'
	import LocationInput from '$lib/components/LocationInput.svelte'
	import { locationDetails, type Coords, type GroupPlace } from '$lib/places'
	import { SESSION_PHOTO_VEIL, sessionPhotoUrl, type SessionPhoto } from '$lib/session-photo'
	import { invalidateAll } from '$app/navigation'
	import type { Snippet } from 'svelte'

	type SessionType = 'repetition' | 'concert' | 'studio' | 'autre'

	type SessionData = {
		id: number
		date: string
		type: SessionType
		title: string | null
		location: string | null
		location_lat: number | null
		location_lon: number | null
		notes: string | null
		members: string[]
	}

	type SessionPatch = {
		date: string
		type: SessionType
		title: string | null
		location: string | null
		location_coords: Coords | null
		members: string[]
		notes: string | null
	}

	// Teinte du bandeau d'en-tête, prise dans la couleur du type (celle de `.type-badge`
	// et du feuillet daté). « Autre » garde le ton neutre.
	const typeHues: Record<SessionType, number | null> = {
		repetition: 14,
		concert: 138,
		studio: 262,
		autre: null
	}

	const typeLabels: Record<SessionType, string> = {
		repetition: 'Répétition',
		concert: 'Concert',
		studio: 'Studio',
		autre: 'Autre',
	}

	let {
		session,
		groupMembers = [],
		saving = false,
		error = null,
		onSave = async () => false,
		stats = null,
		photo = null,
		place = null,
		actions: outerActions
	}: {
		session: SessionData
		/** Membres du groupe actif, proposés comme participants. */
		groupMembers?: string[]
		saving?: boolean
		error?: string | null
		onSave?: (patch: SessionPatch) => Promise<boolean>
		/** Ce qu'a produit la session, affiché dans l'en-tête. */
		stats?: string | null
		/** Photo de bandeau (`session_photos`) : version et voile, `null` sans photo. */
		photo?: SessionPhoto | null
		/** Adresse rattachée au lieu de la session (`group_places`), s'il y en a une. */
		/** Lieu du groupe que désigne le lieu de la session (`group_places`), s'il y en a un. */
		place?: GroupPlace | null
		/** Commandes de l'en-tête, à côté de « Modifier » (le ▶ de la session). */
		actions?: Snippet
	} = $props()

	let editing = $state(false)
	let editDate = $state('')
	let editType = $state<SessionType>('repetition')
	let editTitle = $state('')
	let editLocation = $state('')
	let editCoords = $state<Coords | null>(null)
	let editPlace = $state<GroupPlace | null>(null)
	let editMembers = $state<string[]>([])
	let editNotes = $state('')
	let localError = $state<string | null>(null)
	let photoFile = $state<File | null>(null)
	let photoRemoved = $state(false)
	let editVeil = $state<number>(SESSION_PHOTO_VEIL.default)
	let photoSaving = $state(false)
	let photoAddError = $state<string | null>(null)

	const busy = $derived(saving || photoSaving)

	// Aperçu d'une photo choisie mais pas encore envoyée : l'original, que l'écran recadre
	// au centre comme il recadrera la version réduite par le serveur.
	let pendingPhotoUrl = $state<string | null>(null)
	$effect(() => {
		if (!photoFile) return
		const url = URL.createObjectURL(photoFile)
		pendingPhotoUrl = url
		return () => {
			URL.revokeObjectURL(url)
			pendingPhotoUrl = null
		}
	})

	const sessionCoords = $derived<Coords | null>(
		session.location_lat !== null && session.location_lon !== null
			? { lat: session.location_lat, lon: session.location_lon }
			: null
	)

	const savedPhotoUrl = $derived(photo ? sessionPhotoUrl(session.id, photo.version) : null)
	const previewPhotoUrl = $derived(pendingPhotoUrl ?? (photoRemoved ? null : savedPhotoUrl))

	/** Ce que montre le bandeau : la session telle qu'enregistrée, ou telle qu'en cours d'édition. */
	type Banner = {
		date: string
		type: SessionType
		title: string | null
		location: string | null
		place: GroupPlace | null
		coords: Coords | null
		members: string[]
		photoUrl: string | null
		veil: number
	}

	function formatDate(d: string | Date) {
		return formatDateOnly(d, {
			weekday: 'long',
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		})
	}

	function startEditSession() {
		editDate = toDateOnly(session.date)
		editType = session.type ?? 'repetition'
		editTitle = session.title ?? ''
		editLocation = session.location ?? ''
		editCoords = sessionCoords
		editPlace = place
		editMembers = [...(session.members ?? [])]
		editNotes = session.notes ?? ''
		photoFile = null
		photoRemoved = false
		editVeil = photo?.veil ?? SESSION_PHOTO_VEIL.default
		localError = null
		photoAddError = null
		editing = true
	}

	function cancelEditSession() {
		editing = false
		photoFile = null
		photoRemoved = false
		localError = null
	}

	// La photo part avant la session : le rechargement que déclenche l'enregistrement de
	// la session relit alors aussi la photo. Remplacer emporte le voile dans la même requête.
	async function savePhoto(): Promise<boolean> {
		let init: RequestInit | null = null
		if (photoFile) {
			const body = new FormData()
			body.append('photo', photoFile)
			body.append('veil', String(editVeil))
			init = { method: 'POST', body }
		} else if (photoRemoved && photo) {
			init = { method: 'DELETE' }
		} else if (photo && editVeil !== photo.veil) {
			init = {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ veil: editVeil })
			}
		}
		if (!init) return true

		photoSaving = true
		try {
			const res = await fetch(`/api/sessions/${session.id}/photo`, init)
			if (!res.ok) {
				localError = ((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Erreur ${res.status}.`
				return false
			}
			// Acquis : un second « Enregistrer » après un échec de la session ne renverra pas le fichier.
			photoFile = null
			photoRemoved = false
			return true
		} catch {
			localError = 'Erreur réseau.'
			return false
		} finally {
			photoSaving = false
		}
	}

	async function submitSession(event: SubmitEvent) {
		event.preventDefault()

		if (!editDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
			localError = 'Date invalide (YYYY-MM-DD attendu).'
			return
		}

		localError = null

		if (!(await savePhoto())) return

		const saved = await onSave({
			date: editDate,
			type: editType,
			title: editTitle.trim() || null,
			location: editLocation.trim() || null,
			location_coords: editLocation.trim() ? editCoords : null,
			members: editMembers,
			notes: editNotes.trim() || null
		})

		if (saved) {
			editing = false
		} else {
			// La photo, elle, a pu passer : l'aperçu doit montrer celle qui est en base.
			await invalidateAll()
		}
	}
</script>

<!-- Le même bandeau sert à la lecture et, en édition, d'aperçu fidèle : titre, type et
     voile s'y voient changer avant d'être enregistrés. -->
{#snippet banner(b: Banner, actions?: Snippet)}
	<MediaHeader
		title={b.title ?? formatDate(b.date)}
		{stats}
		hue={typeHues[b.type]}
		photo={b.photoUrl}
		photoVeil={b.veil}
		{actions}
	>
		{#snippet kicker()}
			<span class="type-badge type-{b.type}">{typeLabels[b.type]}</span>
		{/snippet}
		{#snippet cover()}
			<SessionCover date={b.date} type={b.type} />
		{/snippet}
		<!-- La date est déjà sur le feuillet (et dans le titre d'une session sans titre) :
		     ne pas la répéter. -->
		{#if b.location}
			<!-- L'étiquette suffit : « Chez Élise » dit où l'on joue au groupe qui l'a nommée.
			     L'adresse reste au survol et derrière le lien vers la carte. -->
			{@const details = locationDetails(b.location, b.place, b.coords)}
			<p class="meta location">
				<Icon name="pin" size="0.85rem" label="Lieu" class="location-icon" />
				{#if details.map}
					<a
						href={details.map}
						target="_blank"
						rel="noopener noreferrer"
						title={details.address ? `${details.address} — voir sur la carte` : 'Voir sur la carte'}
					>{b.location}</a>
				{:else}
					<span title={details.address ?? undefined}>{b.location}</span>
				{/if}
			</p>
		{/if}
		{#if b.members.length}
			<p class="meta">Présents : {b.members.join(', ')}</p>
		{/if}
	</MediaHeader>
{/snippet}

{#snippet viewActions()}
	<button class="btn btn-ghost mh-secondary" onclick={startEditSession}>
		<Icon name="pencil" size="0.9rem" /> <span class="mh-label">Modifier</span>
	</button>
	<!-- Une photo déjà posée ne se change qu'en édition : ici, seulement l'ajout. -->
	{#if !photo}
		<SessionPhotoAdd sessionId={session.id} onError={(m) => (photoAddError = m)} />
	{/if}
	{@render outerActions?.()}
{/snippet}

<div class="session-header">
	{#if editing}
		<div class="preview" aria-label="Aperçu du bandeau">
			{@render banner({
				date: editDate,
				type: editType,
				title: editTitle.trim() || null,
				location: editLocation.trim() || null,
				place: editPlace,
				coords: editCoords,
				members: editMembers,
				photoUrl: previewPhotoUrl,
				veil: editVeil
			})}
		</div>
		<form class="form-section edit-form" onsubmit={submitSession}>
			{#if localError ?? error}
				<p class="message-error">{localError ?? error}</p>
			{/if}
			<div class="form-row">
				<label class="form-label">
					Type
					<select class="form-input" bind:value={editType} disabled={busy}>
						<option value="repetition">Répétition</option>
						<option value="concert">Concert</option>
						<option value="studio">Studio</option>
						<option value="autre">Autre</option>
					</select>
				</label>
				<label class="form-label">
					Date
					<input class="form-input" type="date" bind:value={editDate} required disabled={busy} />
				</label>
			</div>
			<label class="form-label">
				Titre <span class="hint">(optionnel)</span>
				<input class="form-input" type="text" placeholder="ex : Répète avant Ducasse" bind:value={editTitle} disabled={busy} />
			</label>
			<LocationInput
				bind:value={editLocation}
				bind:coords={editCoords}
				bind:place={editPlace}
				disabled={busy}
			/>
			<div class="form-label">
				Membres présents
				<MembersInput bind:members={editMembers} suggestions={groupMembers} disabled={busy} />
			</div>
			<label class="form-label">
				Notes
				<textarea class="form-input" rows="3" bind:value={editNotes} disabled={busy}></textarea>
			</label>
			<SessionPhotoField
				hasPhoto={photo !== null}
				bind:file={photoFile}
				bind:removed={photoRemoved}
				bind:veil={editVeil}
				disabled={busy}
			/>
			<div class="form-actions">
				<button type="submit" class="btn btn-primary" disabled={busy}>
					{busy ? 'Enregistrement…' : 'Enregistrer'}
				</button>
				<button type="button" class="btn btn-ghost" onclick={cancelEditSession} disabled={busy}>
					Annuler
				</button>
			</div>
		</form>
	{:else}
		{@render banner(
			{
				date: toDateOnly(session.date),
				type: session.type ?? 'repetition',
				title: session.title,
				location: session.location,
				place,
				coords: sessionCoords,
				members: session.members ?? [],
				photoUrl: savedPhotoUrl,
				veil: photo?.veil ?? SESSION_PHOTO_VEIL.default
			},
			viewActions
		)}
		{#if photoAddError}
			<p class="message-error" role="alert">{photoAddError}</p>
		{/if}
		{#if session.notes}
			<p class="notes">{session.notes}</p>
		{/if}
	{/if}
</div>

<style>
	.session-header {
		margin-bottom: 1.5rem;
	}

	/* Dans le libellé de l'en-tête : la couleur du type, le corps du libellé. */
	.type-badge {
		font-size: inherit;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		padding: 0.15rem 0.5rem;
		border-radius: var(--radius-sm);
		white-space: nowrap;
	}

	.type-badge.type-repetition { background: var(--color-accent-light); color: var(--color-accent); }
	.type-badge.type-concert    { background: var(--color-green-light);  color: var(--color-green); }
	.type-badge.type-studio     { background: #f3e8ff; color: #7c3aed; }
	.type-badge.type-autre      { background: var(--color-bg-subtle);    color: var(--color-text-secondary); }

	.meta {
		font-size: 0.9rem;
		color: var(--color-text-secondary);
		margin: 0;
	}

	/* L'icône reste calée sur la première ligne quand un lieu long passe à la ligne. */
	.location {
		display: flex;
		align-items: flex-start;
		gap: 0.3rem;
	}

	.location :global(.location-icon) {
		flex-shrink: 0;
		margin-top: 0.2em;
	}

	.location a {
		color: inherit;
		text-decoration: underline dotted;
		text-underline-offset: 0.15em;
	}

	.location a:hover { text-decoration-style: solid; }


	.notes {
		font-size: var(--text-sm);
		color: #444;
		background: var(--color-bg-subtle);
		border-left: 3px solid var(--color-border-light);
		padding: 0.5rem 0.75rem;
		margin-top: 0.75rem;
		border-radius: 0 var(--radius-md) var(--radius-md) 0;
	}

	.edit-form { margin-top: 0; }

	/* L'aperçu ne se clique pas : il montre, le formulaire en dessous modifie. */
	.preview { pointer-events: none; }

	.form-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}

	.hint {
		font-weight: 400;
		color: #aaa;
		font-size: 0.78rem;
	}

	.form-actions {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}
</style>
