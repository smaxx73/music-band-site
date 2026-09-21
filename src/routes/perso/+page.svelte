<script lang="ts">
	import type { PageData } from './$types'
	import { onMount } from 'svelte'
	import { goto } from '$app/navigation'
	import { page } from '$app/state'
	import { formatDateOnly } from '$lib/date'
	import AudioRecorder from '$lib/components/AudioRecorder.svelte'
	import PublishDialog from '$lib/components/PublishDialog.svelte'
	import Icon from '$lib/components/Icon.svelte'
	import { clearTakes } from '$lib/recording-store'
	import { sendAudioFile } from '$lib/upload-client'
	import { formatDurationLong, type PostType } from '$lib/types'

	let { data }: { data: PageData } = $props()

	type Publication = { post_id: number; group_id: number; group_name: string }
	type Row = {
		id: number
		title: string
		notes: string | null
		file_path: string | null
		youtube_video_id: string | null
		duration_s: number | null
		created_at: string
		publications: Publication[]
	}

	const recordings = $derived(data.recordings as unknown as Row[])
	const currentGroup = $derived(data.currentGroup)

	// ─── Ajout ─────────────────────────────────────────────────────────────
	type Source = 'file' | 'record' | 'youtube'
	let source = $state<Source>('file')
	let file = $state<File | null>(null)
	let recorderBusy = $state(false)
	let title = $state('')
	let notes = $state('')
	let videoUrl = $state('')
	let sending = $state(false)
	let progress = $state(0)
	let addError = $state<string | null>(null)

	function selectSource(next: Source) {
		if (sending || recorderBusy) return
		source = next
		file = null
		addError = null
	}

	/** Un enregistrement fait sur place porte la date du jour : c'est ce qui le distingue. */
	function onRecorded(recorded: File | null) {
		file = recorded
		addError = null
		if (recorded && !title.trim()) {
			title = `Enregistrement du ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`
		}
	}

	async function submitAdd(event: SubmitEvent) {
		event.preventDefault()
		if (sending) return
		addError = null
		progress = 0
		sending = true
		try {
			if (source === 'youtube') {
				if (!videoUrl.trim()) { addError = 'Colle le lien de la vidéo.'; return }
				const res = await fetch('/api/personal/youtube', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ title: title.trim() || null, notes: notes.trim() || null, video_url: videoUrl.trim() })
				})
				const json = await res.json().catch(() => ({}))
				if (!res.ok) { addError = json.error ?? `Erreur ${res.status}`; return }
				await goto(`/perso/${json.id}`)
				return
			}

			if (!file) { addError = source === 'record' ? 'Enregistre d’abord quelque chose.' : 'Choisis un fichier.'; return }
			const created = await sendAudioFile<{ id: number }>(
				'/api/personal',
				file,
				{ title: title.trim(), notes: notes.trim() },
				(p) => (progress = p)
			)
			// Le serveur a le fichier : la copie de secours de l'enregistreur n'a plus lieu d'être.
			if (source === 'record') await clearTakes().catch(() => {})
			await goto(`/perso/${created.id}`)
		} catch (err) {
			addError = err instanceof Error ? err.message : 'Erreur inattendue.'
		} finally {
			sending = false
		}
	}

	// ─── Publication ───────────────────────────────────────────────────────
	let publishOpen = $state(false)
	let publishType = $state<PostType>('recording')
	let publishRecordingId = $state<number | null>(null)

	function openPublish(type: PostType = 'recording', recordingId: number | null = null) {
		publishType = type
		publishRecordingId = recordingId
		publishOpen = true
	}

	// `/perso?publier` : le « + Publier » du tableau de bord arrive ici pour publier.
	onMount(() => {
		if (page.url.searchParams.has('publier') && currentGroup) openPublish()
	})

	const publishChoices = $derived(
		recordings.map((r) => ({
			id: r.id,
			title: r.title,
			published_here: r.publications.some((p) => p.group_id === currentGroup?.id),
			has_audio: r.file_path !== null
		}))
	)

	function formatDate(value: string) {
		return formatDateOnly(value, { day: 'numeric', month: 'short', year: 'numeric' })
	}
</script>

<svelte:head>
	<title>Mon espace</title>
</svelte:head>

<main>
	<div class="page-header">
		<div>
			<h1>Mon espace</h1>
			<p class="lede">Visible par toi seul. Tu choisis ce que tu publies dans un groupe.</p>
		</div>
		{#if currentGroup}
			<button class="btn btn-primary btn-sm" onclick={() => openPublish()}>
				<Icon name="send" size="0.85rem" /> Publier dans « {currentGroup.name} »
			</button>
		{/if}
	</div>

	<form class="form-section add" onsubmit={submitAdd}>
		<h2>Ajouter</h2>
		<div class="source-tabs" role="tablist" aria-label="Source">
			<button type="button" role="tab" aria-selected={source === 'file'} class:active={source === 'file'} onclick={() => selectSource('file')}>
				<Icon name="upload" size="0.85rem" /> Fichier
			</button>
			<button type="button" role="tab" aria-selected={source === 'record'} class:active={source === 'record'} onclick={() => selectSource('record')}>
				<Icon name="mic" size="0.85rem" /> Enregistrer
			</button>
			<button type="button" role="tab" aria-selected={source === 'youtube'} class:active={source === 'youtube'} onclick={() => selectSource('youtube')}>
				<Icon name="video" size="0.85rem" /> Vidéo YouTube
			</button>
		</div>

		{#if source === 'file'}
			<label class="form-label">
				Fichier audio
				<input
					class="form-input"
					type="file"
					accept="audio/*"
					disabled={sending}
					onchange={(e) => (file = (e.currentTarget as HTMLInputElement).files?.[0] ?? null)}
				/>
			</label>
		{:else if source === 'record'}
			<AudioRecorder disabled={sending} onchange={onRecorded} onbusychange={(busy) => (recorderBusy = busy)} />
		{:else}
			<label class="form-label">
				Lien de la vidéo
				<input class="form-input" type="url" bind:value={videoUrl} placeholder="https://youtu.be/…" disabled={sending} />
			</label>
		{/if}

		<label class="form-label">
			Titre <span class="optional">{source === 'record' ? '' : source === 'file' ? '(par défaut : le nom du fichier)' : '(par défaut : celui de la vidéo)'}</span>
			<input class="form-input" type="text" bind:value={title} maxlength="200" disabled={sending} />
		</label>
		<label class="form-label">
			Note <span class="optional">(pour toi seul, même une fois publié)</span>
			<textarea class="form-input" rows="2" bind:value={notes} maxlength="2000" disabled={sending}></textarea>
		</label>

		{#if addError}<p class="message-error" role="alert">{addError}</p>{/if}

		<div class="add-actions">
			<button type="submit" class="btn btn-primary" disabled={sending || recorderBusy}>
				{#if sending}{source === 'youtube' ? 'Ajout…' : `Envoi… ${progress} %`}{:else}Ajouter à mon espace{/if}
			</button>
		</div>
	</form>

	<section class="list">
		<h2>Mes enregistrements ({recordings.length})</h2>
		{#if recordings.length === 0}
			<p class="empty">Rien pour l'instant. Une idée, une partie travaillée seul : c'est ici qu'elle attend.</p>
		{:else}
			<ul>
				{#each recordings as r (r.id)}
					{@const publishedHere = r.publications.some((p) => p.group_id === currentGroup?.id)}
					<li class="card">
						<div class="card-main">
							<a href="/perso/{r.id}" class="card-title">
								{#if r.file_path}<Icon name="waveform" size="0.85rem" />{/if}
								{#if r.youtube_video_id}<Icon name="video" size="0.85rem" />{/if}
								{r.title}
							</a>
							<div class="card-meta">
								{formatDate(r.created_at)}
								{#if r.duration_s}· {formatDurationLong(r.duration_s)}{/if}
								{#if r.notes}· <span class="card-notes" title={r.notes}>{r.notes}</span>{/if}
							</div>
							{#if r.publications.length > 0}
								<div class="pubs">
									{#each r.publications as p (p.post_id)}
										<!-- La publication vit dans son groupe : le lien y bascule s'il le faut. -->
										<a class="pub-chip" href="/posts/{p.post_id}" title="Voir la publication">
											<Icon name="send" size="0.7rem" /> {p.group_name}
										</a>
									{/each}
								</div>
							{/if}
						</div>
						{#if currentGroup && !publishedHere}
							<button class="btn btn-secondary btn-sm" onclick={() => openPublish('recording', r.id)}>Publier</button>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	{#if publishOpen && currentGroup}
		<PublishDialog
			groupName={currentGroup.name}
			recordings={publishChoices}
			initialType={publishType}
			initialRecordingId={publishRecordingId}
			onClose={() => (publishOpen = false)}
			onPublished={(postId) => goto(`/posts/${postId}`)}
		/>
	{/if}
</main>

<style>
	main { max-width: 720px; margin: 2rem auto; padding: 0 1rem; }

	.page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 1.25rem; }
	h1 { font-size: var(--text-xl); margin: 0 0 0.2rem; }
	.lede { margin: 0; font-size: var(--text-sm); color: var(--color-text-secondary); }
	h2 { font-size: 0.85rem; font-weight: 700; text-transform: uppercase; color: var(--color-text-secondary); margin: 0; }

	.source-tabs { display: flex; flex-wrap: wrap; gap: 0.4rem; }
	.source-tabs button {
		display: inline-flex; align-items: center; gap: 0.35rem;
		padding: 0.35rem 0.75rem; border: 1px solid var(--color-border-input); border-radius: 999px;
		background: var(--color-bg); color: inherit; font: inherit; font-size: var(--text-sm); cursor: pointer;
	}
	.source-tabs button.active { border-color: var(--color-primary); background: var(--color-bg-muted); font-weight: 600; }

	.optional { font-weight: 400; color: var(--color-text-muted); }
	textarea { resize: vertical; }
	.add-actions { display: flex; justify-content: flex-end; }

	.list { margin-top: var(--space-8); }
	.list ul { list-style: none; padding: 0; margin: 0.75rem 0 0; display: flex; flex-direction: column; gap: 0.5rem; }
	.card {
		display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;
		border: 1px solid var(--color-border-light); border-radius: var(--radius-lg); padding: 0.7rem 0.9rem;
	}
	.card-main { min-width: 0; display: flex; flex-direction: column; gap: 0.2rem; }
	.card-title { display: inline-flex; align-items: center; gap: 0.35rem; font-weight: 600; color: inherit; text-decoration: none; }
	.card-title:hover { color: var(--color-accent); }
	.card-meta { font-size: var(--text-xs); color: var(--color-text-muted); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.pubs { display: flex; flex-wrap: wrap; gap: 0.3rem; }
	.pub-chip {
		display: inline-flex; align-items: center; gap: 0.25rem; font-size: var(--text-xs);
		padding: 0.1rem 0.5rem; border-radius: 999px; background: var(--color-green-light);
		color: var(--color-success-text); text-decoration: none;
	}

	@media (max-width: 640px) {
		main { margin: 1rem auto; padding: 0 0.75rem; }
		.page-header { flex-direction: column; align-items: stretch; }
		.card { flex-direction: column; align-items: stretch; }
	}
</style>
