<script lang="ts">
	import type { PageData } from './$types'
	import { tick } from 'svelte'
	import { goto, invalidateAll } from '$app/navigation'
	import { page } from '$app/state'
	import { formatDateTimeFull } from '$lib/date'
	import MediaPlayer from '$lib/components/MediaPlayer.svelte'
	import PublishDialog from '$lib/components/PublishDialog.svelte'
	import ClassifyDialog from '$lib/components/ClassifyDialog.svelte'
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte'
	import ShareLinkDialog from '$lib/components/ShareLinkDialog.svelte'
	import Icon from '$lib/components/Icon.svelte'
	import { youtubeWatchUrl } from '$lib/youtube'
	import { personalAudioUrl } from '$lib/types'

	let { data }: { data: PageData } = $props()

	type Publication = { post_id: number; group_id: number; group_name: string }
	type Recording = {
		id: number
		title: string
		notes: string | null
		file_path: string | null
		youtube_video_id: string | null
		youtube_title: string | null
		source_file_name: string | null
		duration_s: number | null
		created_at: string
		publications: Publication[]
		comment_count: number
	}

	const recording = $derived(data.recording as unknown as Recording)
	const currentGroup = $derived(data.currentGroup)
	const publishedHere = $derived(recording.publications.some((p) => p.group_id === currentGroup?.id))

	// ─── Titre et note ─────────────────────────────────────────────────────
	let editing = $state(false)
	let titleDraft = $state('')
	let notesDraft = $state('')
	let saving = $state(false)
	let editError = $state<string | null>(null)
	let titleField = $state<HTMLInputElement | null>(null)

	async function startEdit() {
		titleDraft = recording.title
		notesDraft = recording.notes ?? ''
		editError = null
		editing = true
		await tick()
		titleField?.focus()
	}

	async function saveEdit(event: SubmitEvent) {
		event.preventDefault()
		if (!titleDraft.trim()) { editError = 'Le titre ne peut pas être vide.'; return }
		saving = true
		editError = null
		try {
			const res = await fetch(`/api/personal/${recording.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title: titleDraft.trim(), notes: notesDraft.trim() || null })
			})
			const json = await res.json().catch(() => ({}))
			if (!res.ok) { editError = json.error ?? `Erreur ${res.status}`; return }
			editing = false
			await invalidateAll()
		} catch {
			editError = 'Erreur réseau.'
		} finally {
			saving = false
		}
	}

	// Lien d'écoute public : faire entendre l'enregistrement à qui n'a pas de compte,
	// sans le publier dans un groupe. Seul le propriétaire arrive sur cette page.
	let shareOpen = $state(false)
	let shareCount = $derived(data.shareCount as number)

	// ─── Suppression ───────────────────────────────────────────────────────
	let confirmDeleteOpen = $state(false)
	// `?classer` ouvre la question d'emblée : c'est la suite d'un enregistrement fait sur place.
	let classifyOpen = $state(page.url.searchParams.has('classer'))
	let deleting = $state(false)
	let deleteError = $state<string | null>(null)

	// Une suppression `danger` nomme ce qui part avec : ici, ce que le groupe voyait.
	const deleteMessage = $derived.by(() => {
		const count = recording.publications.length
		const links = shareCount > 0
			? ` ${shareCount > 1 ? 'Ses liens' : 'Son lien'} d'écoute public${shareCount > 1 ? 's' : ''} cesser${shareCount > 1 ? 'ont' : 'a'} de fonctionner.`
			: ''
		if (count === 0) return `« ${recording.title} » et son fichier seront définitivement supprimés.${links}`
		const groups = recording.publications.map((p) => `« ${p.group_name} »`).join(', ')
		const comments = recording.comment_count > 0
			? ` et ${recording.comment_count} commentaire${recording.comment_count > 1 ? 's' : ''}`
			: ''
		return `« ${recording.title} » et son fichier seront définitivement supprimés, avec ${count > 1 ? 'ses publications' : 'sa publication'} dans ${groups}${comments}.${links}`
	})

	async function deleteRecording() {
		deleting = true
		deleteError = null
		try {
			const res = await fetch(`/api/personal/${recording.id}`, { method: 'DELETE' })
			if (!res.ok) {
				const json = await res.json().catch(() => ({}))
				deleteError = json.error ?? `Erreur ${res.status}`
				return
			}
			await goto('/perso')
		} finally {
			deleting = false
			confirmDeleteOpen = false
		}
	}

	let publishOpen = $state(false)

</script>

<svelte:head>
	<title>{recording.title} — Mon espace</title>
</svelte:head>

<main>
	<nav class="breadcrumb">
		<a href="/perso">Mon espace</a> / <span>{recording.title}</span>
	</nav>

	{#if editing}
		<form class="form-section" onsubmit={saveEdit}>
			<label class="form-label">
				Titre
				<input class="form-input" type="text" bind:value={titleDraft} bind:this={titleField} maxlength="200" required disabled={saving} />
			</label>
			<label class="form-label">
				Note <span class="optional">(pour toi seul, même une fois publié)</span>
				<textarea class="form-input" rows="3" bind:value={notesDraft} maxlength="2000" disabled={saving}></textarea>
			</label>
			{#if editError}<p class="message-error">{editError}</p>{/if}
			<div class="form-actions">
				<button type="submit" class="btn btn-primary" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
				<button type="button" class="btn btn-ghost" disabled={saving} onclick={() => (editing = false)}>Annuler</button>
			</div>
		</form>
	{:else}
		<div class="header">
			<div class="header-text">
				<h1>{recording.title}</h1>
				<p class="meta">ajouté le {formatDateTimeFull(recording.created_at)}</p>
				{#if recording.file_path && recording.source_file_name}
					<p class="meta"><Icon name="waveform" size="0.85rem" /> {recording.source_file_name}</p>
				{/if}
				{#if recording.youtube_video_id}
					<p class="meta">
						<Icon name="video" size="0.85rem" />
						<a href={youtubeWatchUrl(recording.youtube_video_id)} target="_blank" rel="noopener noreferrer">
							{recording.youtube_title ?? 'Vidéo YouTube'}
						</a>
					</p>
				{/if}
				{#if recording.notes}<p class="notes"><Icon name="pencil" size="0.85rem" /> {recording.notes}</p>{/if}
			</div>
			<div class="header-actions">
				{#if currentGroup}
					<!-- Enregistré avant d'avoir une session où le ranger : c'est ici qu'il la rejoint. -->
					<button class="btn btn-secondary btn-sm" onclick={() => (classifyOpen = true)}>
						Classer dans une session
					</button>
				{/if}
				{#if recording.file_path}
					<button
						class="btn btn-secondary btn-sm"
						class:shared={shareCount > 0}
						onclick={() => (shareOpen = true)}
						title="Faire écouter cet enregistrement à quelqu'un qui n'a pas de compte"
					>
						<Icon name="globe" size="0.85rem" />
						{shareCount > 0 ? `Écoutable en public (${shareCount})` : 'Lien public'}
					</button>
				{/if}
				<button class="btn btn-secondary btn-sm" onclick={startEdit}>Modifier</button>
				<button class="btn btn-danger btn-sm" disabled={deleting} onclick={() => (confirmDeleteOpen = true)}>Supprimer</button>
			</div>
		</div>
	{/if}

	{#if deleteError}<p class="message-error">{deleteError}</p>{/if}

	<div class="player-card">
		<MediaPlayer
			trackId={`perso-${recording.id}`}
			audioSrc={recording.file_path ? personalAudioUrl(recording.id) : null}
			peaks={data.peaks as number[]}
			duration={recording.duration_s ?? (data.peaksDuration as number | null)}
			videoId={recording.youtube_video_id}
		/>
	</div>

	<section class="publications">
		<div class="section-head">
			<h2>Publications</h2>
			{#if currentGroup && !publishedHere}
				<button class="btn btn-primary btn-sm" onclick={() => (publishOpen = true)}>
					<Icon name="send" size="0.85rem" /> Publier dans « {currentGroup.name} »
				</button>
			{/if}
		</div>
		{#if recording.publications.length === 0}
			<p class="empty">Pas encore publié : personne d'autre que toi ne l'a entendu.</p>
		{:else}
			<ul>
				{#each recording.publications as p (p.post_id)}
					<li><a href="/posts/{p.post_id}"><Icon name="send" size="0.8rem" /> {p.group_name}</a></li>
				{/each}
			</ul>
			<p class="hint">Le groupe écoute ce fichier depuis ton espace : le supprimer retire aussi ces publications.</p>
		{/if}
	</section>

	{#if classifyOpen && currentGroup}
		<ClassifyDialog
			{recording}
			groupName={currentGroup.name}
			onclose={() => (classifyOpen = false)}
			onclassified={(recordingId) => goto(`/recording/${recordingId}`)}
		/>
	{/if}

	{#if publishOpen && currentGroup}
		<PublishDialog
			groupName={currentGroup.name}
			recordings={[{ id: recording.id, title: recording.title, published_here: publishedHere, has_audio: recording.file_path !== null }]}
			initialRecordingId={recording.id}
			onClose={() => (publishOpen = false)}
			onPublished={(postId) => goto(`/posts/${postId}`)}
		/>
	{/if}

	{#if shareOpen}
		<ShareLinkDialog
			target={{ kind: 'personal', id: recording.id }}
			onClose={() => (shareOpen = false)}
			onCountChange={(count) => (shareCount = count)}
		/>
	{/if}

	<ConfirmDialog
		open={confirmDeleteOpen}
		level="danger"
		title="Supprimer cet enregistrement ?"
		message={deleteMessage}
		confirmLabel="Supprimer l'enregistrement"
		busy={deleting}
		onConfirm={deleteRecording}
		onCancel={() => (confirmDeleteOpen = false)}
	/>
</main>

<style>
	main { max-width: 720px; margin: 2rem auto; padding: 0 1rem; }

	.header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 1.25rem; }
	.header-text { min-width: 0; }
	h1 { font-size: 1.4rem; margin: 0 0 0.3rem; overflow-wrap: anywhere; }
	.meta { display: flex; align-items: center; gap: 0.3rem; font-size: var(--text-xs); color: var(--color-text-muted); margin: 0 0 0.15rem; }
	.notes { display: flex; gap: 0.35rem; font-size: var(--text-sm); color: var(--color-text-secondary); margin: 0.5rem 0 0; white-space: pre-line; }
	.header-actions { display: flex; gap: 0.4rem; flex-shrink: 0; flex-wrap: wrap; }
	.header-actions .shared { border-color: var(--color-accent); color: var(--color-accent); }

	.optional { font-weight: 400; color: var(--color-text-muted); }
	textarea { resize: vertical; }
	.form-section { margin-bottom: 1.25rem; }
	.form-actions { display: flex; gap: 0.5rem; }

	.player-card { border: 1px solid var(--color-border-light); border-radius: var(--radius-lg); padding: 0.9rem; }

	.publications { margin-top: var(--space-8); padding-top: var(--space-5); border-top: 1px solid var(--color-border-light); }
	.section-head { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.6rem; }
	h2 { font-size: var(--text-lg); margin: 0; }
	.publications ul { list-style: none; padding: 0; margin: 0 0 0.5rem; display: flex; flex-wrap: wrap; gap: 0.4rem; }
	.publications li a {
		display: inline-flex; align-items: center; gap: 0.3rem; font-size: var(--text-sm);
		padding: 0.2rem 0.65rem; border-radius: 999px; background: var(--color-green-light);
		color: var(--color-success-text); text-decoration: none;
	}
	.hint { font-size: var(--text-xs); color: var(--color-text-muted); margin: 0; }

	@media (max-width: 640px) {
		main { margin: 1rem auto; padding: 0 0.75rem; }
		.header { flex-direction: column; align-items: stretch; }
	}
</style>
