<script lang="ts">
	import { formatDateOnly, toDateOnly } from '$lib/date'
	import MembersInput from '$lib/components/MembersInput.svelte'
	import MediaHeader from '$lib/components/MediaHeader.svelte'
	import Icon from '$lib/components/Icon.svelte'
	import SessionCover from '$lib/components/SessionCover.svelte'
	import type { Snippet } from 'svelte'

	type SessionType = 'repetition' | 'concert' | 'studio' | 'autre'

	type SessionData = {
		id: number
		date: string
		type: SessionType
		title: string | null
		location: string | null
		notes: string | null
		members: string[]
	}

	type SessionPatch = {
		date: string
		type: SessionType
		title: string | null
		location: string | null
		members: string[]
		notes: string | null
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
		/** Commandes de l'en-tête, à côté de « Modifier » (le ▶ de la session). */
		actions?: Snippet
	} = $props()

	let editing = $state(false)
	let editDate = $state('')
	let editType = $state<SessionType>('repetition')
	let editTitle = $state('')
	let editLocation = $state('')
	let editMembers = $state<string[]>([])
	let editNotes = $state('')
	let localError = $state<string | null>(null)

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
		editMembers = [...(session.members ?? [])]
		editNotes = session.notes ?? ''
		localError = null
		editing = true
	}

	function cancelEditSession() {
		editing = false
		localError = null
	}

	async function submitSession(event: SubmitEvent) {
		event.preventDefault()

		if (!editDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
			localError = 'Date invalide (YYYY-MM-DD attendu).'
			return
		}

		localError = null

		const saved = await onSave({
			date: editDate,
			type: editType,
			title: editTitle.trim() || null,
			location: editLocation.trim() || null,
			members: editMembers,
			notes: editNotes.trim() || null
		})

		if (saved) {
			editing = false
		}
	}
</script>

<div class="session-header">
	{#if editing}
		<form class="form-section edit-form" onsubmit={submitSession}>
			{#if localError ?? error}
				<p class="message-error">{localError ?? error}</p>
			{/if}
			<div class="form-row">
				<label class="form-label">
					Type
					<select class="form-input" bind:value={editType} disabled={saving}>
						<option value="repetition">Répétition</option>
						<option value="concert">Concert</option>
						<option value="studio">Studio</option>
						<option value="autre">Autre</option>
					</select>
				</label>
				<label class="form-label">
					Titre <span class="hint">(optionnel)</span>
					<input class="form-input" type="text" placeholder="ex : Répète avant Ducasse" bind:value={editTitle} disabled={saving} />
				</label>
			</div>
			<div class="form-row">
				<label class="form-label">
					Date
					<input class="form-input" type="date" bind:value={editDate} required disabled={saving} />
				</label>
				<label class="form-label">
					Lieu
					<input
						class="form-input"
						type="text"
						placeholder="ex : Studio, Salle des fêtes…"
						bind:value={editLocation}
						disabled={saving}
					/>
				</label>
			</div>
			<div class="form-label">
				Membres présents
				<MembersInput bind:members={editMembers} suggestions={groupMembers} disabled={saving} />
			</div>
			<label class="form-label">
				Notes
				<textarea class="form-input" rows="3" bind:value={editNotes} disabled={saving}></textarea>
			</label>
			<div class="form-actions">
				<button type="submit" class="btn btn-primary" disabled={saving}>
					{saving ? 'Enregistrement…' : 'Enregistrer'}
				</button>
				<button type="button" class="btn btn-ghost" onclick={cancelEditSession} disabled={saving}>
					Annuler
				</button>
			</div>
		</form>
	{:else}
		<MediaHeader title={session.title ?? formatDate(session.date)} {stats}>
			{#snippet kicker()}
				<span class="type-badge type-{session.type ?? 'repetition'}">{typeLabels[session.type ?? 'repetition']}</span>
			{/snippet}
			{#snippet cover()}
				<SessionCover date={session.date} type={session.type ?? 'repetition'} />
			{/snippet}
			<!-- Sans titre, le h1 porte déjà la date : ne pas la répéter. -->
			{#if session.title || session.location}
				<p class="meta">
					{#if session.title}{formatDate(session.date)}{/if}
					{#if session.title && session.location} · {/if}
					{#if session.location}{session.location}{/if}
				</p>
			{/if}
			{#if session.members?.length}
				<p class="meta">Présents : {session.members.join(', ')}</p>
			{/if}
			{#snippet actions()}
				<button class="btn btn-ghost mh-secondary" onclick={startEditSession}>
					<Icon name="pencil" size="0.9rem" /> Modifier
				</button>
				{@render outerActions?.()}
			{/snippet}
		</MediaHeader>
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
