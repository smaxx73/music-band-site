<script lang="ts">
	type SessionData = {
		id: number
		date: string
		location: string | null
		notes: string | null
		members: string[]
	}

	type SessionPatch = {
		date: string
		location: string | null
		members: string[]
		notes: string | null
	}

	let {
		session,
		saving = false,
		error = null,
		onSave = async () => false
	}: {
		session: SessionData
		saving?: boolean
		error?: string | null
		onSave?: (patch: SessionPatch) => Promise<boolean>
	} = $props()

	let editing = $state(false)
	let editDate = $state('')
	let editLocation = $state('')
	let editMembers = $state('')
	let editNotes = $state('')
	let localError = $state<string | null>(null)

	function formatDate(d: string) {
		return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', {
			weekday: 'long',
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		})
	}

	function startEditSession() {
		editDate = session.date
		editLocation = session.location ?? ''
		editMembers = (session.members ?? []).join(', ')
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
		const members = editMembers
			.split(',')
			.map((member) => member.trim())
			.filter(Boolean)

		const saved = await onSave({
			date: editDate,
			location: editLocation.trim() || null,
			members,
			notes: editNotes.trim() || null
		})

		if (saved) {
			editing = false
		}
	}
</script>

<div class="session-header">
	{#if editing}
		<form class="edit-form" onsubmit={submitSession}>
			{#if localError ?? error}
				<p class="form-error">{localError ?? error}</p>
			{/if}
			<div class="form-row">
				<label class="form-label">
					Date
					<input type="date" bind:value={editDate} required disabled={saving} />
				</label>
				<label class="form-label">
					Lieu
					<input
						type="text"
						placeholder="ex : Studio, Salle des fêtes…"
						bind:value={editLocation}
						disabled={saving}
					/>
				</label>
			</div>
			<label class="form-label">
				Membres présents <span class="hint">(séparés par des virgules)</span>
				<input
					type="text"
					placeholder="Marc, Julie, Thomas"
					bind:value={editMembers}
					disabled={saving}
				/>
			</label>
			<label class="form-label">
				Notes
				<textarea rows="3" bind:value={editNotes} disabled={saving}></textarea>
			</label>
			<div class="form-actions">
				<button type="submit" class="btn-primary" disabled={saving}>
					{saving ? 'Enregistrement…' : 'Enregistrer'}
				</button>
				<button type="button" class="btn-ghost" onclick={cancelEditSession} disabled={saving}>
					Annuler
				</button>
			</div>
		</form>
	{:else}
		<div class="header-top">
			<h1>{formatDate(session.date)}</h1>
			<button class="btn-edit" onclick={startEditSession}>Modifier</button>
		</div>
		{#if session.location}
			<p class="meta">{session.location}</p>
		{/if}
		{#if session.members?.length}
			<p class="meta">Présents : {session.members.join(', ')}</p>
		{/if}
		{#if session.notes}
			<p class="notes">{session.notes}</p>
		{/if}
	{/if}
</div>

<style>
	.session-header {
		margin-bottom: 2rem;
	}

	.header-top {
		display: flex;
		align-items: baseline;
		gap: 0.75rem;
		margin-bottom: 0.4rem;
	}

	h1 {
		font-size: 1.5rem;
		margin: 0;
		text-transform: capitalize;
	}

	.btn-edit {
		font-size: 0.78rem;
		color: #888;
		background: none;
		border: 1px solid #ddd;
		border-radius: 3px;
		padding: 0.15rem 0.5rem;
		cursor: pointer;
		white-space: nowrap;
	}

	.btn-edit:hover {
		background: #f4f4f4;
		color: #444;
	}

	.meta {
		font-size: 0.9rem;
		color: #555;
		margin: 0.15rem 0;
	}

	.notes {
		font-size: 0.875rem;
		color: #444;
		background: #f8f8f8;
		border-left: 3px solid #ddd;
		padding: 0.5rem 0.75rem;
		margin-top: 0.75rem;
		border-radius: 0 4px 4px 0;
	}

	.edit-form {
		background: #f8f8f8;
		border: 1px solid #e0e0e0;
		border-radius: 8px;
		padding: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.form-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}

	.form-label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.82rem;
		font-weight: 600;
		color: #444;
	}

	.hint {
		font-weight: 400;
		color: #aaa;
		font-size: 0.78rem;
	}

	.form-label input,
	.form-label textarea {
		padding: 0.4rem 0.6rem;
		border: 1px solid #ddd;
		border-radius: 4px;
		font-size: 0.875rem;
		font-family: inherit;
		background: white;
	}

	.form-label textarea {
		resize: vertical;
	}

	.form-label input:disabled,
	.form-label textarea:disabled {
		opacity: 0.6;
	}

	.form-actions {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.btn-primary {
		padding: 0.45rem 1rem;
		background: #1a1a1a;
		color: white;
		border: none;
		border-radius: 4px;
		font-size: 0.875rem;
		cursor: pointer;
	}

	.btn-primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-primary:hover:not(:disabled) {
		background: #333;
	}

	.btn-ghost {
		padding: 0.45rem 0.75rem;
		background: none;
		border: 1px solid #ccc;
		border-radius: 4px;
		font-size: 0.875rem;
		cursor: pointer;
		color: #555;
	}

	.btn-ghost:hover:not(:disabled) {
		background: #f0f0f0;
	}

	.btn-ghost:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.form-error {
		color: #c0392b;
		font-size: 0.85rem;
		margin: 0;
	}
</style>
