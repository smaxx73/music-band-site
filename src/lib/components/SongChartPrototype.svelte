<script lang="ts">
	import { onMount, tick, untrack, type Snippet } from 'svelte'
	import { strFromU8, unzipSync } from 'fflate'
	import { chordProTitle, parseChordPro } from '$lib/chordpro'
	import { moveAbcPitch } from '$lib/abc-editor'
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte'
	import Icon from '$lib/components/Icon.svelte'
	import type { ConfirmRequest } from '$lib/confirm-submit.svelte'

	type BlockType = 'chordpro' | 'notation'
	type Block = { id: number; type: BlockType; label: string }
	type Token = { chord: string | null; text: string }
	type ImportedScore = {
		file?: File
		file_name: string
		format: 'musicxml' | 'mxl'
		warning: string | null
	}
	type Sheet = {
		id: number
		title: string
		manifest: Block[]
		contents: Record<string, string>
		can_delete: boolean
		originals: { block_id: number; file_name: string; format: 'musicxml' | 'mxl'; warning: string | null }[]
	}

	let {
		songId = null,
		songTitle = 'Nouvelle feuille de répétition',
		songLyrics = null,
		songMusicNotes = null,
		initialSheet = null,
		breadcrumb
	}: {
		songId?: number | null
		songTitle?: string
		/** Paroles et accords de la fiche du morceau : une feuille neuve en part. */
		songLyrics?: string | null
		songMusicNotes?: string | null
		/** Feuille du morceau déjà enregistrée, chargée avec la page. */
		initialSheet?: Sheet | null
		breadcrumb?: Snippet
	} = $props()

	// La liste décrit seulement la composition. Les sources restent dans un magasin
	// séparé : c'est la forme que prendront les futurs fichiers et enregistrements.
	const sampleBlocks: Block[] = [
		{ id: 1, type: 'chordpro', label: 'Couplet' },
		{ id: 2, type: 'notation', label: 'Intro' },
		{ id: 3, type: 'chordpro', label: 'Refrain' }
	]
	const sampleContent: Record<number, string> = {
		1: `{comment: Couplet}
[D]Quand le jour se [G]lève, je [D]cherche encore ta [A]voix
[D]Dans le bruit des [G]rues, elle me [D]ramène vers [A]toi`,
		2: `X:1
T:Intro
M:4/4
L:1/8
Q:1/4=112
K:D
"D" F2 A2 d2 A2 | "G" B2 A2 F2 E2 | "D" D4 "A" A4 |]`,
		3: `{start_of_chorus: Refrain}
[G]On chante plus [D]fort, [A]pour ne rien ou[G]blier
[G]On joue jusqu'au [D]soir, [A]sans jamais s'ar[G]rêter
{end_of_chorus}`
	}

	// Les paroles et les accords saisis dans la fiche du morceau (/songs) deviennent des
	// blocs : une feuille neuve en part au lieu de les faire retaper. Le texte libre est
	// déjà du ChordPro valide — sans crochets, il s'affiche tel quel.
	function songFieldBlocks(firstId: number): { blocks: Block[]; contents: Record<number, string> } {
		const fields = [
			{ label: 'Paroles', source: songLyrics?.trim() },
			{ label: 'Accords / infos musicales', source: songMusicNotes?.trim() }
		].filter((field): field is { label: string; source: string } => Boolean(field.source))
		return {
			blocks: fields.map((field, index) => ({ id: firstId + index, type: 'chordpro', label: field.label })),
			contents: Object.fromEntries(fields.map((field, index) => [firstId + index, field.source]))
		}
	}

	function startingSheet(): { blocks: Block[]; contents: Record<number, string> } {
		if (!songId) return { blocks: structuredClone(sampleBlocks), contents: structuredClone(sampleContent) }
		const fromSong = songFieldBlocks(1)
		if (fromSong.blocks.length) return fromSong
		return { blocks: [{ id: 1, type: 'chordpro', label: 'Paroles et accords' }], contents: { 1: '' } }
	}

	// La page est recréée pour un autre morceau ({#key}) : l'état initial ne suit pas les props.
	const initial = untrack(() => initialSheet
		? {
				blocks: initialSheet.manifest,
				contents: initialSheet.contents as Record<number, string>,
				assets: Object.fromEntries(initialSheet.originals.map((original) => [original.block_id, original])) as Record<number, ImportedScore>
			}
		: { ...startingSheet(), assets: {} as Record<number, ImportedScore> })

	const sharps = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
	const flats = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
	const noteIndex: Record<string, number> = { C: 0, 'B#': 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, Fb: 4, F: 5, 'E#': 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11, Cb: 11 }

	// Une feuille se lit d'abord : on vient la suivre en répétition bien plus souvent
	// que la corriger. « Modifier » ouvre l'atelier, comme une playlist ou /songs.
	// Une feuille libre (sans morceau) n'a pas de page de lecture tant qu'aucune n'est ouverte.
	let mode = $state<'read' | 'edit'>(untrack(() => songId ? 'read' : 'edit'))
	// Transposition de lecture : ne touche pas la feuille, sert à qui joue avec un capo.
	let readTranspose = $state(0)
	let documentId = $state<number | null>(untrack(() => initialSheet?.id ?? null))
	let documentTitle = $state(untrack(() => initialSheet?.title ?? songTitle))
	let documents = $state<{ id: number; title: string }[]>([])
	// Décidé par le serveur (canDeleteScoreDocument) : auteur ou admin du groupe.
	let canDelete = $state(untrack(() => initialSheet?.can_delete === true))
	// État enregistré des originaux, pour qu'« Annuler » rende aussi ceux d'un bloc retiré.
	let savedAssets: Record<number, ImportedScore> = initial.assets
	let deleting = $state(false)
	let pendingConfirm = $state<(ConfirmRequest & { resolve: (ok: boolean) => void }) | null>(null)
	let saveError = $state<string | null>(null)
	let saving = $state(false)
	let loading = $state(false)
	let savedSnapshot = $state('')
	let chordFileInput = $state<HTMLInputElement>()
	let selectedNoteIndex = $state<number | null>(null)
	let blocks = $state<Block[]>(initial.blocks)
	let blockContent = $state<Record<number, string>>(initial.contents)
	let notationAssets = $state<Record<number, ImportedScore>>(initial.assets)
	let selectedId = $state(initial.blocks[0]?.id ?? 1)
	let transpose = $state(0)
	let previewMode = $state<'rendered' | 'text'>('rendered')
	let editor = $state<HTMLTextAreaElement>()
	let renderAbc = $state<((target: HTMLElement, source: string, options?: Record<string, unknown>) => unknown) | null>(null)
	let abcTargets = new Map<number, HTMLElement>()
	let abcErrorMap = new Map<number, string>()
	let abcErrors = $state<Record<number, string>>({})
	let notationLoadError = $state<string | null>(null)
	let importError = $state<string | null>(null)
	let importInProgress = $state(false)
	let scoreFileInput = $state<HTMLInputElement>()

	const selected = $derived(blocks.find((block) => block.id === selectedId) ?? blocks[0])
	const selectedSource = $derived(selected ? blockContent[selected.id] ?? '' : '')
	const chords = $derived(selected?.type === 'chordpro' ? getChords(selectedSource) : [])
	const notationTokens = $derived(selected?.type === 'notation' ? getNotationTokens(selectedSource) : [])
	const dirty = $derived(snapshot() !== savedSnapshot || Object.values(notationAssets).some((asset) => asset.file))
	const canTranspose = $derived(blocks.some((block) => block.type === 'notation' || getChords(blockContent[block.id] ?? '').length > 0))

	// Ne jamais laisser l'import asynchrone du moteur de gravure interrompre
	// l'hydratation Svelte : l'éditeur de blocs reste utilisable même si ABC échoue.
	onMount(() => {
		markSaved()
		void loadAbc()
		// La feuille d'un morceau arrive avec la page ; seules les feuilles libres se listent.
		if (!songId) void loadDocuments()
		const warnBeforeLeaving = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault() }
		window.addEventListener('beforeunload', warnBeforeLeaving)
		return () => window.removeEventListener('beforeunload', warnBeforeLeaving)
	})

	$effect(() => {
		blocks
		blockContent
		renderAbc
		mode
		readTranspose
		if (!renderAbc) return
		for (const block of blocks.filter((item) => item.type === 'notation')) {
			const target = abcTargets.get(block.id)
			if (target) drawAbc(target, block.id, blockContent[block.id] ?? '')
		}
	})

	async function loadAbc() {
		try {
			const abcjs = await import('abcjs')
			renderAbc = abcjs.renderAbc
		} catch {
			notationLoadError = 'Le moteur de gravure n’a pas pu se charger ; les blocs de texte restent éditables.'
		}
	}

	function chooseScoreFile() {
		importError = null
		scoreFileInput?.click()
	}

	async function importScore(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0]
		// Permet d'importer deux fois le même fichier après l'avoir modifié.
		if (scoreFileInput) scoreFileInput.value = ''
		if (!file) return

		const extension = file.name.toLowerCase().split('.').pop()
		if (!['musicxml', 'xml', 'mxl'].includes(extension ?? '')) {
			importError = 'Choisis un fichier MusicXML (.musicxml ou .xml) ou compressé (.mxl).'
			return
		}
		if (file.size > 10 * 1024 * 1024) {
			importError = 'Le fichier dépasse la limite du prototype (10 Mo).'
			return
		}

		importInProgress = true
		importError = null
		try {
			const xml = await readMusicXml(file, extension === 'mxl')
			const { convertMusicXmlToAbc } = await import('@educandu/abc-tools')
			const { result, warningMessage } = convertMusicXmlToAbc(xml, { d: 4 })
			const id = Math.max(0, ...blocks.map((block) => block.id)) + 1
			const insertionIndex = Math.max(0, blocks.findIndex((block) => block.id === selectedId) + 1)
			const label = file.name.replace(/\.(musicxml|xml|mxl)$/i, '') || 'Mini-partition'
			const block: Block = { id, type: 'notation', label }
			blocks = [...blocks.slice(0, insertionIndex), block, ...blocks.slice(insertionIndex)]
			blockContent = { ...blockContent, [id]: result }
			notationAssets = {
				...notationAssets,
				[id]: { file, file_name: file.name, format: extension === 'mxl' ? 'mxl' : 'musicxml', warning: warningMessage || null }
			}
			selectedId = id
			transpose = 0
		} catch (error) {
			importError = error instanceof Error ? `Conversion impossible : ${error.message}` : 'Conversion MusicXML impossible.'
		} finally {
			importInProgress = false
		}
	}

	async function readMusicXml(file: File, compressed: boolean): Promise<string> {
		const bytes = new Uint8Array(await file.arrayBuffer())
		if (!compressed) return decodeXml(bytes)

		let archive: Record<string, Uint8Array>
		try {
			archive = unzipSync(bytes)
		} catch {
			throw new Error('le fichier MXL n’est pas une archive ZIP valide')
		}
		const totalSize = Object.values(archive).reduce((total, data) => total + data.byteLength, 0)
		if (totalSize > 50 * 1024 * 1024) throw new Error('le contenu décompressé dépasse 50 Mo')
		const container = archive['META-INF/container.xml']
		if (!container) throw new Error('le conteneur MusicXML META-INF/container.xml est manquant')
		const containerXml = new DOMParser().parseFromString(strFromU8(container), 'application/xml')
		const scorePath = containerXml.querySelector('rootfile')?.getAttribute('full-path')
		if (!scorePath || !archive[scorePath]) throw new Error('la partition MusicXML est introuvable dans le fichier MXL')
		return decodeXml(archive[scorePath])
	}

	function decodeXml(bytes: Uint8Array) {
		if (bytes[0] === 0xff && bytes[1] === 0xfe || bytes[0] === 0x3c && bytes[1] === 0) return new TextDecoder('utf-16le').decode(bytes)
		if (bytes[0] === 0xfe && bytes[1] === 0xff || bytes[0] === 0 && bytes[1] === 0x3c) return new TextDecoder('utf-16be').decode(bytes)
		return new TextDecoder('utf-8').decode(bytes)
	}

	function originalUrl(blockId: number, download = false) {
		return documentId ? `/api/score-documents/${documentId}/originals/${blockId}${download ? '?download' : ''}` : '#'
	}

	function snapshot() { return JSON.stringify({ title: documentTitle, manifest: blocks, contents: blockContent }) }

	async function apiJson(response: Response) {
		const body = await response.json()
		if (!response.ok) throw new Error(body.error || 'Une erreur est survenue.')
		return body
	}

	function ask(request: ConfirmRequest): Promise<boolean> {
		return new Promise((resolve) => { pendingConfirm = { ...request, resolve } })
	}

	function answer(ok: boolean) {
		const pending = pendingConfirm
		pendingConfirm = null
		pending?.resolve(ok)
	}

	const discardRequest: ConfirmRequest = {
		level: 'warning',
		title: 'Abandonner les modifications ?',
		message: 'Les changements non enregistrés de cette feuille seront perdus.',
		confirmLabel: 'Abandonner les modifications'
	}

	function markSaved() {
		savedSnapshot = snapshot()
		savedAssets = notationAssets
	}

	function resetToStart() {
		const start = startingSheet()
		documentId = null; canDelete = false; documentTitle = songTitle
		blocks = start.blocks; blockContent = start.contents; notationAssets = {}
		selectedId = start.blocks[0]?.id ?? 1; selectedNoteIndex = null; transpose = 0
	}

	async function loadDocuments() {
		loading = true
		try {
			const data = await apiJson(await fetch('/api/score-documents'))
			documents = data.documents
			if (documents.length) await openDocument(documents[0].id)
			else markSaved()
		} catch (error) { saveError = error instanceof Error ? error.message : 'Chargement impossible.' }
		finally { loading = false }
	}

	async function openDocument(id: number) {
		if (dirty && !(await ask(discardRequest))) return
		loading = true; saveError = null
		try {
			const { document, originals } = await apiJson(await fetch(`/api/score-documents/${id}`))
			documentId = document.id
			documentTitle = document.title
			canDelete = document.can_delete === true
			blocks = document.manifest
			blockContent = document.contents
			notationAssets = Object.fromEntries(originals.map((original: { block_id: number; file_name: string; format: 'musicxml' | 'mxl'; warning: string | null }) => [original.block_id, original]))
			selectedId = blocks[0]?.id ?? 0; selectedNoteIndex = null; transpose = 0
			markSaved()
			mode = 'read'
		} catch (error) { saveError = error instanceof Error ? error.message : 'Ouverture impossible.' }
		finally { loading = false }
	}

	async function newDocument() {
		if (dirty && !(await ask(discardRequest))) return
		resetToStart()
		markSaved(); saveError = null
		mode = 'edit'
	}

	function startEditing() {
		saveError = null
		selectedId = blocks.find((block) => block.id === selectedId)?.id ?? blocks[0]?.id ?? 1
		selectedNoteIndex = null; transpose = 0; previewMode = 'rendered'
		mode = 'edit'
	}

	// « Annuler » rend la feuille telle qu'enregistrée : rien n'est appliqué avant
	// « Enregistrer », comme à l'édition d'une session.
	async function cancelEditing() {
		if (dirty && !(await ask(discardRequest))) return
		if (documentId) {
			const saved = JSON.parse(savedSnapshot) as { title: string; manifest: Block[]; contents: Record<number, string> }
			documentTitle = saved.title; blocks = saved.manifest; blockContent = saved.contents
			notationAssets = savedAssets
			selectedId = blocks[0]?.id ?? 1; selectedNoteIndex = null; transpose = 0
		} else {
			resetToStart()
		}
		saveError = null
		mode = 'read'
	}

	async function saveDocument(): Promise<boolean> {
		if (saving) return false
		saving = true; saveError = null
		try {
			const payload = { title: documentTitle, song_id: songId, manifest: blocks, contents: blockContent }
			const method = documentId ? 'PATCH' : 'POST'
			const response = await apiJson(await fetch(documentId ? `/api/score-documents/${documentId}` : '/api/score-documents', {
				method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
			}))
			// Une feuille qu'on vient de créer est à soi.
			if (method === 'POST') canDelete = true
			documentId = response.document.id
			for (const [key, asset] of Object.entries(notationAssets)) {
				if (!asset.file) continue
				const data = new FormData()
				data.set('file', asset.file)
				if (asset.warning) data.set('warning', asset.warning)
				await apiJson(await fetch(originalUrl(Number(key)), { method: 'POST', body: data }))
				notationAssets = { ...notationAssets, [key]: { ...asset, file: undefined } }
			}
			documents = [{ id: response.document.id, title: documentTitle }, ...documents.filter((item) => item.id !== documentId)]
			markSaved()
			return true
		} catch (error) {
			saveError = error instanceof Error ? error.message : 'Sauvegarde impossible.'
			return false
		} finally { saving = false }
	}

	async function saveAndRead() {
		if (await saveDocument()) mode = 'read'
	}

	async function deleteDocument() {
		if (!documentId || deleting) return
		const confirmed = await ask({
			level: 'danger',
			title: 'Supprimer cette feuille ?',
			message: `« ${documentTitle} » sera supprimée avec tous ses blocs et les partitions importées${songId ? ', pour tout le groupe. Les paroles et accords de la fiche du morceau restent' : ''}. Cette action est irréversible.`,
			confirmLabel: 'Supprimer la feuille'
		})
		if (!confirmed) return
		deleting = true
		try {
			await apiJson(await fetch(`/api/score-documents/${documentId}`, { method: 'DELETE' }))
			documents = documents.filter((item) => item.id !== documentId)
			resetToStart()
			markSaved()
			mode = songId ? 'read' : 'edit'
			if (documents.length) await openDocument(documents[0].id)
		} catch (error) { saveError = error instanceof Error ? error.message : 'Suppression impossible.' }
		finally { deleting = false }
	}

	// Reprendre la fiche dans une feuille déjà commencée : les deux ne se synchronisent
	// pas, et la fiche a pu être complétée depuis.
	function insertSongFields() {
		const id = Math.max(0, ...blocks.map((block) => block.id)) + 1
		const fromSong = songFieldBlocks(id)
		if (!fromSong.blocks.length) return
		const index = Math.max(0, blocks.findIndex((block) => block.id === selectedId) + 1)
		blocks = [...blocks.slice(0, index), ...fromSong.blocks, ...blocks.slice(index)]
		blockContent = { ...blockContent, ...fromSong.contents }
		selectedId = id; selectedNoteIndex = null; transpose = 0
	}

	async function importChordPro(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0]
		if (chordFileInput) chordFileInput.value = ''
		if (!file) return
		if (file.size > 1024 * 1024) { importError = 'Le fichier ChordPro dépasse 1 Mo.'; return }
		const source = (await file.text()).replace(/^\uFEFF/, '')
		const id = Math.max(0, ...blocks.map((block) => block.id)) + 1
		const index = Math.max(0, blocks.findIndex((block) => block.id === selectedId) + 1)
		const label = chordProTitle(source) || file.name.replace(/\.(cho|chordpro|pro|txt)$/i, '') || 'Paroles et accords'
		blocks = [...blocks.slice(0, index), { id, type: 'chordpro', label }, ...blocks.slice(index)]
		blockContent = { ...blockContent, [id]: source }
		selectedId = id; transpose = 0; importError = null
	}

	function abcTarget(node: HTMLElement, block: Block) {
		abcTargets.set(block.id, node)
		if (renderAbc) drawAbc(node, block.id, blockContent[block.id] ?? '')
		// Passer de la lecture à l'édition remonte un nouveau conteneur pour le même bloc :
		// l'ancien ne doit pas emporter l'entrée du nouveau en partant.
		return { destroy: () => { if (abcTargets.get(block.id) === node) abcTargets.delete(block.id) } }
	}

	function contentRepeatsBlockLabel(block: Block, source: string): boolean {
		if (!block.label.trim()) return false
		const title = block.type === 'chordpro'
			? parseChordPro(source).find((line) => line.kind !== 'empty')
			: source.match(/^T:\s*(.+?)\s*$/m)?.[1]
		const heading = typeof title === 'string' ? title : title?.kind === 'section' ? title.label : null
		const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('fr')
		return heading !== null && normalize(heading) === normalize(block.label)
	}

	function drawAbc(target: HTMLElement, blockId: number, source: string) {
		if (!renderAbc) return
		try {
			abcErrorMap.delete(blockId); abcErrors = Object.fromEntries(abcErrorMap)
			target.replaceChildren()
			renderAbc(target, source, {
				responsive: 'resize', oneSvgPerLine: true, add_classes: true, staffwidth: 650, paddingtop: 8, paddingbottom: 8,
				// En lecture, la partition suit la transposition des accords ; l'aperçu
				// d'édition montre toujours la source telle qu'elle est.
				visualTranspose: mode === 'read' ? readTranspose : 0
			})
			const firstSystem = target.firstElementChild
			const block = blocks.find((item) => item.id === blockId)
			if (firstSystem && block && !contentRepeatsBlockLabel(block, source)) {
				const caption = document.createElement('div')
				caption.className = 'print-score-caption'
				caption.textContent = block.label || 'Mini-partition'
				firstSystem.prepend(caption)
			}
		} catch {
			abcErrorMap.set(blockId, 'Cette mini-partition ABC ne peut pas être lue.')
			abcErrors = Object.fromEntries(abcErrorMap)
		}
	}

	function add(type: 'chordpro' | 'notation') {
		const id = Math.max(0, ...blocks.map((block) => block.id)) + 1
		const index = Math.max(0, blocks.findIndex((block) => block.id === selectedId) + 1)
		const block: Block = type === 'chordpro'
			? { id, type, label: 'Nouvelle section' }
			: { id, type, label: 'Nouvelle mini-partition' }
		const source = type === 'chordpro'
			? `{comment: Nouvelle section}\n[Dm]Écris ici les paroles et les [Bb]accords.`
			: `X:1\nT:Mini-partition\nM:4/4\nL:1/8\nK:C\n"C" C2 D2 E2 G2 |]`
		blocks = [...blocks.slice(0, index), block, ...blocks.slice(index)]
		blockContent = { ...blockContent, [id]: source }
		selectedId = id; selectedNoteIndex = null; transpose = 0
	}

	function updateBlock(change: Pick<Block, 'label'>) {
		blocks = blocks.map((block) => block.id === selectedId ? { ...block, ...change } : block)
	}

	function updateSource(source: string) { blockContent = { ...blockContent, [selectedId]: source } }

	function move(direction: -1 | 1) {
		const index = blocks.findIndex((block) => block.id === selectedId)
		const destination = index + direction
		if (destination < 0 || destination >= blocks.length) return
		const next = [...blocks]; [next[index], next[destination]] = [next[destination], next[index]]; blocks = next
	}

	function remove() {
		if (blocks.length === 1) return
		const index = blocks.findIndex((block) => block.id === selectedId)
		blocks = blocks.filter((block) => block.id !== selectedId)
		const nextContent = { ...blockContent }; delete nextContent[selectedId]; blockContent = nextContent
		const nextAssets = { ...notationAssets }; delete nextAssets[selectedId]; notationAssets = nextAssets
		selectedId = blocks[Math.max(0, index - 1)].id; transpose = 0
	}

	async function printDocument() {
		// L'impression est toujours basée sur la vue lisible, jamais sur les sources brutes.
		previewMode = 'rendered'
		if (!renderAbc && !notationLoadError) await loadAbc()
		await tick()
		window.print()
	}

	function plainTextDocument() {
		return blocks
			.map((block, index) => `--- ${index + 1}. ${block.label || 'Sans titre'} — ${block.type === 'chordpro' ? 'ChordPro' : 'ABC'} ---\n${blockContent[block.id] ?? ''}`)
			.join('\n\n')
	}


	function tokens(source: string): Token[] {
		const result: Token[] = []; let position = 0; let chord: string | null = null
		for (const match of source.matchAll(/\[([^\]]+)\]/g)) {
			const text = source.slice(position, match.index)
			if (text || chord) result.push({ chord, text })
			chord = match[1]; position = (match.index ?? 0) + match[0].length
		}
		const tail = source.slice(position)
		if (tail || chord) result.push({ chord, text: tail })
		return result.length ? result : [{ chord: null, text: source }]
	}

	function getChords(source: string) { return [...new Set([...source.matchAll(/\[([^\]]+)\]/g)].map((match) => match[1]).filter((chord) => !chord.startsWith('*')))] }

	function transposed(chord: string, semitones = transpose) {
		if (!semitones || chord === 'N.C.' || chord === 'NC') return chord
		const flat = chord.includes('b') && !chord.includes('#')
		return chord.replace(/(^|\/)([A-G])([#b]?)/g, (whole, prefix: string, root: string, accidental: string) => {
			const index = noteIndex[`${root}${accidental}`]
			return index === undefined ? whole : `${prefix}${(flat ? flats : sharps)[(index + semitones + 120) % 12]}`
		})
	}

	function getNotationTokens(source: string) {
		const keyLine = source.search(/^K:.*$/m)
		const newline = source.indexOf('\n', keyLine)
		const start = keyLine < 0 ? 0 : newline < 0 ? source.length : newline + 1
		const body = source.slice(start)
		// Les accords entre guillemets, paroles, commentaires et champs ABC ne sont pas des notes.
		const pattern = /"[^"]*"|\[[^\]]+\]|%[^\n]*|^(?:[A-Za-z]:|%%)[^\n]*|(?<note>(?:\^\^|__|[\^_=])?[A-Ga-g][,']*(?:\d+\/\d+|\d+|\/\d+|\/+)?|[zx](?:\d+\/\d+|\d+|\/\d+|\/+)?|:\||\|:|\|\]|\|\||\|)/gm
		return [...body.matchAll(pattern)]
			.filter((match) => match.groups?.note)
			.map((match) => ({ text: match[0], start: start + (match.index ?? 0), end: start + (match.index ?? 0) + match[0].length }))
	}

	function headerValue(key: string) { return selectedSource.match(new RegExp(`^${key}:(.*)$`, 'm'))?.[1]?.trim() ?? '' }
	function setHeader(key: string, value: string) {
		const pattern = new RegExp(`^${key}:.*$`, 'm')
		updateSource(pattern.test(selectedSource) ? selectedSource.replace(pattern, `${key}:${value}`) : `${key}:${value}\n${selectedSource}`)
	}
	function editNote(value: string) {
		const token = selectedNoteIndex === null ? null : notationTokens[selectedNoteIndex]
		if (token) {
			updateSource(`${selectedSource.slice(0, token.start)}${value}${selectedSource.slice(token.end)}`)
		} else {
			const finalBar = selectedSource.match(/\s*\|\]\s*$/)
			const body = finalBar ? selectedSource.slice(0, finalBar.index) : selectedSource
			const separator = body.endsWith(' ') || body.endsWith('\n') ? '' : ' '
			updateSource(`${body}${separator}${value}${finalBar ? ` ${finalBar[0].trim()}` : ''}`)
			selectedNoteIndex = null
		}
	}
	function selectedNoteParts() {
		const token = selectedNoteIndex === null ? '' : notationTokens[selectedNoteIndex]?.text ?? ''
		const match = token.match(/^(\^\^|__|[\^_=])?([A-Ga-gzx])([,']*)(.*)$/)
		return match ? { accidental: match[1] ?? '', pitch: match[2], octave: match[3], duration: match[4] } : null
	}
	function changeNotePart(part: 'accidental' | 'pitch' | 'octave' | 'duration', value: string) {
		const current = selectedNoteParts()
		if (!current) return
		editNote(`${part === 'accidental' ? value : current.accidental}${part === 'pitch' ? value : current.pitch}${part === 'octave' ? value : current.octave}${part === 'duration' ? value : current.duration}`)
	}
	function appendNote(value: string) { selectedNoteIndex = null; editNote(value) }
	function onNoteKeydown(event: KeyboardEvent) {
		if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
		if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
			const direction = event.key === 'ArrowRight' ? 1 : -1
			let index = selectedNoteIndex ?? (direction === 1 ? -1 : notationTokens.length)
			while (index + direction >= 0 && index + direction < notationTokens.length) {
				index += direction
				if (moveAbcPitch(notationTokens[index].text, 1) !== null) {
					event.preventDefault()
					selectedNoteIndex = index
					const list = event.currentTarget as HTMLDivElement
					list.querySelectorAll<HTMLButtonElement>('button')[index]?.focus()
					return
				}
			}
			event.preventDefault()
			return
		}
		if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
		const token = selectedNoteIndex === null ? null : notationTokens[selectedNoteIndex]
		const moved = token ? moveAbcPitch(token.text, event.key === 'ArrowUp' ? 1 : -1) : null
		if (!moved) return
		event.preventDefault()
		editNote(moved)
	}
	function removeNote() {
		const token = selectedNoteIndex === null ? null : notationTokens[selectedNoteIndex]
		if (!token) return
		updateSource(`${selectedSource.slice(0, token.start)}${selectedSource.slice(token.end)}`)
		selectedNoteIndex = null
	}

	function applyTranspose() {
		if (!selected || selected.type !== 'chordpro' || !transpose) return
		updateSource(selectedSource.replace(/\[([^\]]+)\]/g, (_all, chord: string) => `[${chord.startsWith('*') ? chord : transposed(chord)}]`))
		transpose = 0
	}

	async function insertChord(chord: string) {
		if (!editor || !selected) return
		const start = editor.selectionStart, end = editor.selectionEnd, insert = `[${chord}]`
		updateSource(`${selectedSource.slice(0, start)}${insert}${selectedSource.slice(end)}`)
		await tick(); editor.focus(); editor.setSelectionRange(start + insert.length, start + insert.length)
	}
</script>

{#snippet transposeOptions()}
	{#each [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5] as step}<option value={step}>{step > 0 ? `+${step}` : step < 0 ? `−${-step}` : '0'}</option>{/each}
{/snippet}

<!-- Les blocs mis en forme, communs à la lecture et à l'aperçu d'édition. -->
{#snippet renderedBlocks(reading: boolean)}
	{#each blocks as block (block.id)}
		<section class="rendered" class:notation={block.type === 'notation'}>
			{#if !contentRepeatsBlockLabel(block, blockContent[block.id] ?? '')}<div class="caption"><strong>{block.label || 'Sans titre'}</strong></div>{/if}
			{#if block.type === 'chordpro'}
				<div class="chart">
					{#each parseChordPro(blockContent[block.id] ?? '') as line}
						{#if line.kind === 'section'}<h3>{line.label}</h3>
						{:else if line.kind === 'line'}<p class="chart-line">{#each tokens(line.source) as token}<span class="token"><span class="chord">{token.chord ? transposed(token.chord, reading ? readTranspose : block.id === selectedId ? transpose : 0) : ' '}</span><span class="lyric">{token.text || ' '}</span></span>{/each}</p>
						{:else}<div class="space"></div>{/if}
					{/each}
				</div>
			{:else}
				{#if abcErrors[block.id]}<p class="abc-error">{abcErrors[block.id]}</p>{/if}
				<p class="score-scroll-hint">Glisse horizontalement pour lire la partition.</p>
				<div class="abc-output" use:abcTarget={block}></div>
			{/if}
		</section>
	{/each}
{/snippet}

{#if mode === 'read'}
	<main class="page page-wide sheet">
		{@render breadcrumb?.()}
		<header class="page-header sheet-header">
			<div>
				<p class="eyebrow">Feuille de répétition</p>
				<h1>{documentTitle}</h1>
			</div>
			<div class="page-actions">
				{#if documentId}
					{#if canTranspose}
						<label class="read-transpose" title="Pour la lecture et l’impression : la feuille enregistrée ne change pas">
							Transposer <select bind:value={readTranspose}>{@render transposeOptions()}</select>
						</label>
					{/if}
					<button class="btn btn-secondary" onclick={printDocument}><Icon name="download" /> Imprimer / PDF</button>
					<button class="btn btn-primary" onclick={startEditing}><Icon name="pencil" /> Modifier</button>
				{/if}
				{#if !songId}<button class="btn btn-secondary" onclick={newDocument}><Icon name="plus" /> Nouvelle feuille</button>{/if}
			</div>
		</header>
		{#if !songId && documents.length > 1}
			<div class="document-tools"><label>Document <select value={documentId ?? ''} onchange={(event) => { const id = Number(event.currentTarget.value); if (id) void openDocument(id) }}>{#each documents as document}<option value={document.id}>{document.title}</option>{/each}</select></label></div>
		{/if}
		{#if saveError}<p class="message-error" role="alert">{saveError}</p>{/if}
		{#if notationLoadError}<p class="abc-error">{notationLoadError}</p>{/if}

		{#if documentId}
			<div class="sheet-body">{@render renderedBlocks(true)}</div>
		{:else if loading}
			<p class="empty">Chargement…</p>
		{:else}
			<div class="sheet-empty">
				<p>Ce morceau n’a pas encore de feuille de répétition : les paroles avec les accords placés au-dessus, les sections dans l’ordre du morceau et, si besoin, quelques mesures de partition. Elle se lit ici et s’imprime.</p>
				{#if songLyrics?.trim() || songMusicNotes?.trim()}
					<p>Elle partira des {songLyrics?.trim() && songMusicNotes?.trim() ? 'paroles et des accords' : songLyrics?.trim() ? 'paroles' : 'accords'} déjà saisis dans la fiche du morceau.</p>
				{/if}
				<button class="btn btn-primary" onclick={startEditing}><Icon name="plus" /> Créer la feuille</button>
			</div>
		{/if}
	</main>
{:else}
	<main class="composer" aria-labelledby="composer-title">
		{@render breadcrumb?.()}
		<header class="page-header composer-header">
			<div>
				<p class="eyebrow">Feuille de répétition</p>
				<h1 id="composer-title">{documentId ? 'Modifier la feuille' : 'Créer la feuille'}</h1>
				<p class="intro">Assemble des sections de paroles et accords (ChordPro) et des mini-partitions dans l’ordre du morceau. Rien n’est appliqué avant « Enregistrer ».</p>
			</div>
			<div class="page-actions">
				{#if documentId && canDelete}<button class="btn btn-danger" onclick={deleteDocument} disabled={deleting || saving}>{deleting ? 'Suppression…' : 'Supprimer la feuille'}</button>{/if}
				{#if songId || documentId}<button class="btn btn-secondary" onclick={cancelEditing} disabled={saving}>Annuler</button>{/if}
				<button class="btn btn-primary" onclick={saveAndRead} disabled={saving || loading}>{saving ? 'Sauvegarde…' : 'Enregistrer'}</button>
			</div>
		</header>

		<div class="document-tools">
			{#if !songId}<label>Document <select value={documentId ?? ''} onchange={(event) => { const id = Number(event.currentTarget.value); if (id) void openDocument(id) }}><option value="">Nouvelle feuille</option>{#each documents as document}<option value={document.id}>{document.title}</option>{/each}</select></label>{/if}
			<label>Titre <input bind:value={documentTitle} maxlength="200" /></label>
			{#if saveError}<p class="message-error" role="alert">{saveError}</p>{/if}
		</div>
		<div class="workspace">
			<aside class="block-list" aria-label="Blocs de la feuille">
				<div class="list-heading"><h2>Blocs</h2><span>{blocks.length}</span></div>
				<div class="blocks">{#each blocks as block, index (block.id)}<button class:selected={block.id === selectedId} class="block-card" onclick={() => { selectedId = block.id; selectedNoteIndex = null; transpose = 0 }}><span class="order">{index + 1}</span><span class="icon">{block.type === 'chordpro' ? 'Aa' : '𝄞'}</span><span class="block-copy"><strong>{block.label || 'Sans titre'}</strong><small>{block.type === 'chordpro' ? 'Paroles et accords' : 'Mini-partition'}</small></span></button>{/each}</div>
				<div class="add-buttons">
					<button class="btn btn-secondary btn-sm" onclick={() => add('chordpro')}><Icon name="plus" /> Paroles et accords</button>
					<button class="btn btn-secondary btn-sm" onclick={() => add('notation')}><Icon name="plus" /> Mini-partition vide</button>
					{#if songId && (songLyrics?.trim() || songMusicNotes?.trim())}
						<button class="btn btn-secondary btn-sm import-button" onclick={insertSongFields} title="Ajoute les paroles et les accords de la fiche du morceau, tels qu’ils y sont aujourd’hui">Reprendre la fiche du morceau</button>
					{/if}
					<button class="btn btn-secondary btn-sm import-button" onclick={() => chordFileInput?.click()}>Importer ChordPro</button>
					<button class="btn btn-secondary btn-sm import-button" onclick={chooseScoreFile} disabled={importInProgress}>{importInProgress ? 'Conversion…' : 'Importer MusicXML / MXL'}</button>
				</div>
				<input bind:this={chordFileInput} class="file-input" type="file" accept=".cho,.chordpro,.pro,.txt,text/plain" onchange={importChordPro} />
				<input bind:this={scoreFileInput} class="file-input" type="file" accept=".musicxml,.xml,.mxl,application/vnd.recordare.musicxml+xml,application/xml" onchange={importScore} />
				{#if importError}<p class="import-error">{importError}</p>{/if}
			</aside>

			<section class="editor-panel">
				{#if selected}
					<div class="editor-heading">
						<div><p class="eyebrow">Édition du bloc</p><h2>{selected.type === 'chordpro' ? 'Paroles et accords (ChordPro)' : 'Mini-éditeur de partition'}</h2></div>
						<div class="actions">
							<button class="btn btn-secondary btn-sm" title="Monter" aria-label="Monter le bloc" onclick={() => move(-1)}><Icon name="arrow-up" /></button>
							<button class="btn btn-secondary btn-sm" title="Descendre" aria-label="Descendre le bloc" onclick={() => move(1)}><Icon name="arrow-down" /></button>
							<button class="btn btn-danger btn-sm" onclick={remove} disabled={blocks.length === 1}>Retirer</button>
						</div>
					</div>
					<label>Nom du bloc <input value={selected.label} oninput={(event) => updateBlock({ label: event.currentTarget.value })} /></label>
					{#if selected.type === 'chordpro'}
						<div class="tools"><label>Transposer l’aperçu <select bind:value={transpose}>{@render transposeOptions()}</select></label><button class="btn btn-primary btn-sm" onclick={applyTranspose} disabled={!transpose}>Appliquer au bloc</button></div>
						<textarea bind:this={editor} value={selectedSource} oninput={(event) => updateSource(event.currentTarget.value)} spellcheck="false" aria-label="Source ChordPro" placeholder={'{comment: Couplet}\n[C]Les paroles, avec les [G]accords entre crochets'}></textarea>
						<div class="chords">{#each chords as chord}<button onclick={() => insertChord(chord)}>{chord}</button>{/each}</div>
					{:else}
						<div class="notation-editor">
							<div class="notation-meta"><label>Mesure <input value={headerValue('M')} oninput={(event) => setHeader('M', event.currentTarget.value)} /></label><label>Durée <input value={headerValue('L')} oninput={(event) => setHeader('L', event.currentTarget.value)} /></label><label>Tonalité <input value={headerValue('K')} oninput={(event) => setHeader('K', event.currentTarget.value)} /></label></div>
							<p class="hint">Sélectionne une note : ←/→ pour la parcourir, ↑/↓ pour monter ou descendre d’un degré. L’aperçu se met à jour aussitôt.</p>
							<div class="note-list" role="toolbar" tabindex="-1" aria-label="Notes de la partition" onkeydown={onNoteKeydown}>{#each notationTokens as note, index}<button class:active={selectedNoteIndex === index} aria-pressed={selectedNoteIndex === index} onfocus={() => selectedNoteIndex = index} onclick={() => selectedNoteIndex = index} title="Modifier cette note">{note.text}</button>{/each}</div>
							<div class="note-controls"><label>Hauteur <select value={selectedNoteParts()?.pitch ?? ''} onchange={(event) => changeNotePart('pitch', event.currentTarget.value)} disabled={!selectedNoteParts()}><option value="">—</option>{#each ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'c', 'd', 'e', 'f', 'g', 'a', 'b', 'z'] as note}<option value={note}>{note}</option>{/each}</select></label><label>Altération <select value={selectedNoteParts()?.accidental ?? ''} onchange={(event) => changeNotePart('accidental', event.currentTarget.value)} disabled={!selectedNoteParts()}><option value="">Aucune</option><option value="^">♯</option><option value="_">♭</option><option value="=">♮</option><option value="^^">𝄪</option><option value="__">𝄫</option></select></label><label>Octave <select value={selectedNoteParts()?.octave ?? ''} onchange={(event) => changeNotePart('octave', event.currentTarget.value)} disabled={!selectedNoteParts()}><option value="">Normale</option><option value=",">Basse</option><option value=",,">Très basse</option><option value="'">Haute</option><option value="''">Très haute</option></select></label><label>Durée <select value={selectedNoteParts()?.duration ?? ''} onchange={(event) => changeNotePart('duration', event.currentTarget.value)} disabled={!selectedNoteParts()}><option value="">1 × L</option><option value="/2">½ × L</option><option value="/">½ × L (ABC)</option><option value="2">2 × L</option><option value="3">3 × L</option><option value="4">4 × L</option><option value="3/2">1½ × L</option></select></label><button class="btn btn-danger btn-sm" onclick={removeNote} disabled={selectedNoteIndex === null}>Effacer</button></div>
							<div class="note-palette"><span>Ajouter :</span>{#each ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'c', 'd', 'e', 'f', 'g', 'a', 'b', 'z', '|'] as note}<button onclick={() => appendNote(note)}>{note}</button>{/each}</div>
							<details><summary>Éditer la source ABC</summary><textarea class="abc-source-editor" value={selectedSource} oninput={(event) => { selectedNoteIndex = null; updateSource(event.currentTarget.value) }} spellcheck="false" autocapitalize="off" aria-label="Source ABC"></textarea></details>
						</div>
						{#if notationAssets[selected.id]}
							<div class="original-file"><span><strong>Original conservé :</strong> {notationAssets[selected.id].file_name} ({notationAssets[selected.id].format.toUpperCase()})</span>{#if notationAssets[selected.id].file}<span>En attente de sauvegarde</span>{:else}<a class="btn btn-secondary btn-sm" href={originalUrl(selected.id)} target="_blank" rel="noopener">Ouvrir</a><a class="btn btn-secondary btn-sm" href={originalUrl(selected.id, true)}>Télécharger</a>{/if}</div>
							{#if notationAssets[selected.id].warning}<p class="conversion-warning">Conversion ABC : {notationAssets[selected.id].warning}</p>{/if}
						{/if}
					{/if}
				{/if}
			</section>

			<section class="preview" aria-live="polite">
				<div class="preview-heading"><div><p class="eyebrow">Aperçu</p><h2>{documentTitle}</h2><p>{dirty ? 'Modifications non enregistrées' : 'Enregistré'}</p></div><div class="preview-tabs"><button class:active={previewMode === 'rendered'} onclick={() => previewMode = 'rendered'} aria-pressed={previewMode === 'rendered'}>Mis en forme</button><button class:active={previewMode === 'text'} onclick={() => previewMode = 'text'} aria-pressed={previewMode === 'text'}>Texte brut</button></div></div>
				{#if notationLoadError}<p class="abc-error load-error">{notationLoadError}</p>{/if}
				{#if previewMode === 'text'}
					<pre class="plain-text">{plainTextDocument()}</pre>
				{:else}
					{@render renderedBlocks(false)}
				{/if}
			</section>
		</div>
	</main>
{/if}

<ConfirmDialog
	open={pendingConfirm !== null}
	level={pendingConfirm?.level}
	title={pendingConfirm?.title ?? ''}
	message={pendingConfirm?.message ?? ''}
	confirmLabel={pendingConfirm?.confirmLabel}
	onConfirm={() => answer(true)}
	onCancel={() => answer(false)}
/>

<style>
	h2 { margin: 0; font-size: var(--text-base); } p { margin: 0; }
	.eyebrow { color: var(--color-text-muted); font-size: var(--text-xs); font-weight: 700; letter-spacing: .08em; text-transform: uppercase; } .intro { margin-top: .35rem; color: var(--color-text-secondary); max-width: 48rem; font-size: var(--text-sm); }
	button:disabled { opacity: var(--disabled-opacity); cursor: not-allowed; }
	input, select { border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: .4rem .5rem; color: var(--color-text); background: var(--color-bg); font: inherit; text-transform: none; letter-spacing: normal; }

	/* Lecture : la feuille seule, dans une colonne de lecture. */
	.sheet-header h1 { margin-top: .15rem; } .read-transpose { display: flex; align-items: center; gap: .4rem; color: var(--color-text-secondary); font-size: var(--text-sm); } .read-transpose select { padding: .3rem .4rem; }
	.sheet .message-error, .sheet > .abc-error { margin-bottom: 1rem; }
	.sheet-body { border: 1px solid var(--color-border-light); border-radius: var(--radius-lg); background: var(--color-bg); overflow: hidden; } .sheet-body .rendered { padding: 1rem 1.25rem; } .sheet-body .rendered:last-child { border-bottom: 0; } .sheet-body .chart-line { font-size: var(--text-base); }
	.sheet-empty { display: grid; gap: .75rem; justify-items: start; padding: 1.25rem; border: 1px dashed var(--color-border); border-radius: var(--radius-lg); color: var(--color-text-secondary); font-size: var(--text-sm); line-height: 1.5; } .sheet-empty p { max-width: 40rem; }

	/* Édition : l'atelier en trois colonnes. */
	.composer { max-width: 1400px; margin: 2rem auto 4rem; padding: 0 1rem; color: var(--color-text); } .composer-header h1 { margin-top: .15rem; }
	.document-tools { display: flex; flex-wrap: wrap; gap: .75rem; align-items: end; margin-bottom: 1rem; } .document-tools label { display: grid; gap: .25rem; color: var(--color-text-secondary); font-size: var(--text-sm); } .document-tools input { min-width: 16rem; } .notation-editor { padding: .8rem 1rem; } .notation-meta, .note-controls, .note-palette { display: flex; flex-wrap: wrap; gap: .4rem; align-items: end; margin-bottom: .7rem; } .notation-meta label, .note-controls label { display: grid; gap: .25rem; font-size: var(--text-xs); } .notation-meta input { width: 5rem; } .notation-editor .hint { margin: 0 0 .7rem; } .note-list { display: flex; flex-wrap: wrap; gap: .3rem; padding: .5rem; min-height: 2.5rem; border: 1px solid var(--color-border-light); border-radius: var(--radius-sm); margin-bottom: .7rem; } .note-list button, .note-palette button { min-width: 2rem; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-bg); color: var(--color-text); padding: .3rem; cursor: pointer; } .note-list button.active { border-color: var(--color-accent); color: var(--color-accent-dark); } .notation-editor details summary { cursor: pointer; color: var(--color-accent-dark); font-size: var(--text-sm); } .notation-editor textarea.abc-source-editor { box-sizing: border-box; width: 100%; min-height: 14rem; margin: .6rem 0 0; } .workspace { display: grid; grid-template-columns: minmax(270px, 300px) minmax(300px, .85fr) minmax(350px, 1.15fr); align-items: start; border: 1px solid var(--color-border-light); border-radius: var(--radius-lg); background: var(--color-bg); overflow: hidden; } .block-list { padding: .75rem; border-right: 1px solid var(--color-border-light); background: var(--color-bg-subtle); } .list-heading { display: flex; justify-content: space-between; padding: .25rem .25rem .7rem; } .list-heading span { color: var(--color-text-muted); }
	.blocks { display: grid; gap: .35rem; } .block-card { display: grid; grid-template-columns: 1.3rem 1.45rem minmax(0, 1fr); gap: .4rem; align-items: center; width: 100%; padding: .55rem .45rem; border: 1px solid transparent; border-radius: var(--radius-sm); color: var(--color-text); background: transparent; text-align: left; cursor: pointer; } .block-card:hover { background: var(--color-bg); } .block-card.selected { border-color: var(--color-accent); background: var(--color-bg); } .order { color: var(--color-text-muted); font: var(--text-xs) ui-monospace, monospace; text-align: center; } .icon { color: var(--color-accent-dark); font-weight: 700; } .block-copy { min-width: 0; } .block-card strong, .block-card small { display: block; overflow-wrap: anywhere; } .block-card strong { font-size: var(--text-sm); line-height: 1.3; } .block-card small { margin-top: .12rem; color: var(--color-text-muted); font-size: var(--text-xs); line-height: 1.3; } .add-buttons { display: grid; gap: .45rem; margin-top: 1rem; } .add-buttons .btn { justify-content: flex-start; white-space: normal; text-align: left; } .import-button { border-style: dashed; color: var(--color-accent-dark); } .file-input { display: none; } .import-error { margin: .7rem .15rem 0; color: var(--color-error); font-size: var(--text-xs); line-height: 1.4; }
	.editor-panel { min-width: 0; border-right: 1px solid var(--color-border-light); } .editor-heading, .preview-heading { display: flex; justify-content: space-between; gap: .75rem; align-items: flex-start; padding: 1rem; border-bottom: 1px solid var(--color-border-light); } .actions { display: flex; gap: .35rem; } .editor-panel > label { display: grid; gap: .3rem; padding: .8rem 1rem .4rem; color: var(--color-text-secondary); font-size: var(--text-xs); font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
	.tools { display: flex; align-items: center; gap: .55rem; padding: .35rem 1rem .65rem; color: var(--color-text-secondary); font-size: var(--text-xs); } .tools label { display: flex; align-items: center; gap: .4rem; } textarea { display: block; box-sizing: border-box; width: calc(100% - 2rem); min-height: 20rem; margin: .2rem 1rem .8rem; resize: vertical; border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: .7rem; color: var(--color-text); background: var(--color-bg-subtle); font: var(--text-sm)/1.55 ui-monospace, monospace; } .chords { display: flex; flex-wrap: wrap; gap: .35rem; padding: 0 1rem 1rem; } .chords button { border: 1px solid var(--color-border); color: var(--color-accent-dark); background: var(--color-bg); padding: .2rem .45rem; border-radius: var(--radius-pill); font: 600 var(--text-xs)/1.2 ui-monospace, monospace; cursor: pointer; } .chords button:hover { background: var(--color-bg-subtle); } .hint, .conversion-warning { margin: 0 1rem 1rem; color: var(--color-text-muted); font-size: var(--text-sm); line-height: 1.45; } .original-file { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: .5rem; margin: 0 1rem .55rem; padding: .6rem; border: 1px solid var(--color-border-light); border-radius: var(--radius-sm); color: var(--color-text-secondary); font-size: var(--text-sm); } .original-file strong { color: var(--color-text); } .conversion-warning { color: var(--color-warning-text); }
	.preview { min-width: 0; background: var(--color-bg); } .preview-heading h2 { margin-top: .2rem; font-size: var(--text-lg); } .preview-heading > div > p:last-child { margin-top: .1rem; color: var(--color-text-muted); font-size: var(--text-xs); } .preview-tabs { display: flex; border: 1px solid var(--color-border); border-radius: var(--radius-sm); overflow: hidden; } .preview-tabs button { border: 0; border-right: 1px solid var(--color-border); padding: .3rem .45rem; color: var(--color-text-secondary); background: var(--color-bg); font: var(--text-xs) inherit; cursor: pointer; } .preview-tabs button:last-child { border-right: 0; } .preview-tabs button.active { color: var(--color-bg); background: var(--color-primary); } .plain-text { margin: 0; padding: 1rem; min-height: 24rem; overflow: auto; color: var(--color-text); background: var(--color-bg-subtle); font: var(--text-xs)/1.55 ui-monospace, monospace; white-space: pre-wrap; }

	/* Blocs mis en forme, en lecture comme dans l'aperçu. */
	.rendered { padding: .8rem 1rem; border-bottom: 1px solid var(--color-border-light); } .caption { display: flex; gap: .45rem; align-items: baseline; margin-bottom: .55rem; } .caption strong { font-size: var(--text-sm); } .chart h3 { margin: .65rem 0 .3rem; color: var(--color-accent-dark); font-size: var(--text-sm); text-transform: uppercase; letter-spacing: .06em; } .chart h3:first-child { margin-top: 0; } .chart-line { min-height: 2.65rem; white-space: pre-wrap; line-height: 1.35; } .token { display: inline-flex; flex-direction: column; vertical-align: bottom; } .chord { min-height: 1.2rem; color: var(--color-accent-dark); font: 700 var(--text-xs)/1.15 ui-monospace, monospace; } .lyric { min-height: 1.35rem; white-space: pre-wrap; } .space { height: .55rem; } .score-scroll-hint { display: none; } .abc-output :global(.print-score-caption) { display: none; } .abc-output { overflow-x: auto; } .abc-output :global(svg) { max-width: 100%; height: auto; } .abc-error { margin-bottom: .5rem; color: var(--color-error); font-size: var(--text-sm); } .load-error { margin: .75rem 1rem 0; }
	@media (max-width: 1050px) { .workspace { grid-template-columns: minmax(245px, 280px) 1fr; } .preview { grid-column: 1 / -1; border-top: 1px solid var(--color-border-light); } .preview .rendered { max-width: 760px; margin: auto; } } @media (max-width: 650px) { .score-scroll-hint { display: block; margin-bottom: .3rem; color: var(--color-text-muted); font-size: var(--text-xs); } .abc-output { overflow-x: auto; touch-action: pan-x; } .abc-output :global(> div) { min-width: 600px; overflow: visible !important; } .abc-output :global(svg) { max-width: none; min-width: 600px; } .workspace { grid-template-columns: 1fr; } .block-list, .editor-panel { border-right: 0; border-bottom: 1px solid var(--color-border-light); } .blocks, .add-buttons { grid-template-columns: repeat(2, minmax(0, 1fr)); } .sheet-body .rendered { padding: .8rem; } }

	@page { size: A4; margin: 12mm; }
	@media print {
		:global(.app-top-bar), :global(.app-sidebar), :global(.breadcrumb), :global(.mini-player), :global(.group-switch-banner), :global(.no-group-banner) { display: none !important; }
		:global(.app-body), :global(.app-content) { display: block !important; margin: 0 !important; padding: 0 !important; background: #fff !important; }
		.composer, .sheet { max-width: none; margin: 0; padding: 0; color: #000; }
		.composer-header, .document-tools, .block-list, .editor-panel, .preview-tabs, .load-error, .score-scroll-hint, .sheet-header .page-actions, .sheet-header .eyebrow { display: none !important; }
		.sheet-header { margin-bottom: 0; padding: 0 0 5mm; border-bottom: 1px solid #222; } .sheet-header h1 { font-size: 16pt; }
		.sheet-body { border: 0; border-radius: 0; overflow: visible; background: #fff; } .sheet-body .rendered { padding: 5mm 0; }
		.workspace { display: block; border: 0; border-radius: 0; overflow: visible; background: #fff; }
		.preview { display: block; background: #fff; }
		.preview-heading { padding: 0 0 5mm; border-bottom: 1px solid #222; }
		.preview-heading h2 { font-size: 16pt; }
		.preview-heading .eyebrow, .preview-heading p:last-child { display: none; }
		.rendered { break-inside: auto; page-break-inside: auto; padding: 5mm 0; border-bottom-color: #bbb; }
		.rendered.notation > .caption { display: none; }
		.caption { margin-bottom: 3mm; break-after: avoid; }
		.chart-line, .chart h3, .abc-output :global(svg) { break-inside: avoid; page-break-inside: avoid; }
		.chart h3 { color: #000; }
		.chord { color: #000; }
		.abc-output { overflow: visible; }
		.abc-output :global(.print-score-caption) { display: block; margin-bottom: 3mm; font-weight: 700; font-size: 10pt; }
		.abc-output :global(> div) { display: block; min-width: 0; overflow: visible !important; break-inside: avoid; }
		.abc-output :global(svg) { display: block; max-width: 100%; min-width: 0; }
	}
</style>
