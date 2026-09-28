<script lang="ts">
	import { onMount, tick } from 'svelte'

	type BlockType = 'chordpro' | 'notation'
	type Block = { id: number; type: BlockType; label: string }
	type Line = { kind: 'section'; label: string } | { kind: 'line'; source: string } | { kind: 'empty' }
	type Token = { chord: string | null; text: string }
	type ImportedScore = {
		file: File
		format: 'musicxml' | 'mxl'
		warning: string | null
	}

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

	const sharps = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
	const flats = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
	const noteIndex: Record<string, number> = { C: 0, 'B#': 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, Fb: 4, F: 5, 'E#': 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11, Cb: 11 }

	let blocks = $state<Block[]>(structuredClone(sampleBlocks))
	let blockContent = $state<Record<number, string>>(structuredClone(sampleContent))
	let notationAssets = $state<Record<number, ImportedScore>>({})
	let selectedId = $state(1)
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

	// Ne jamais laisser l'import asynchrone du moteur de gravure interrompre
	// l'hydratation Svelte : l'éditeur de blocs reste utilisable même si ABC échoue.
	onMount(() => { void loadAbc() })

	$effect(() => {
		blocks
		blockContent
		renderAbc
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
				[id]: { file, format: extension === 'mxl' ? 'mxl' : 'musicxml', warning: warningMessage || null }
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
		if (!compressed) return new TextDecoder().decode(bytes)

		const { unzipSync, strFromU8 } = await import('fflate')
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
		return strFromU8(archive[scorePath])
	}

	function downloadOriginal(blockId: number) {
		const asset = notationAssets[blockId]
		if (!asset) return
		const url = URL.createObjectURL(asset.file)
		const link = document.createElement('a')
		link.href = url
		link.download = asset.file.name
		link.click()
		setTimeout(() => URL.revokeObjectURL(url), 0)
	}

	function abcTarget(node: HTMLElement, block: Block) {
		abcTargets.set(block.id, node)
		if (renderAbc) drawAbc(node, block.id, blockContent[block.id] ?? '')
		return { destroy: () => abcTargets.delete(block.id) }
	}

	function drawAbc(target: HTMLElement, blockId: number, source: string) {
		if (!renderAbc) return
		try {
			abcErrorMap.delete(blockId); abcErrors = Object.fromEntries(abcErrorMap)
			target.replaceChildren()
			renderAbc(target, source, { responsive: 'resize', add_classes: true, staffwidth: 650, paddingtop: 8, paddingbottom: 8 })
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
		selectedId = id; transpose = 0
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

	function reset() { blocks = structuredClone(sampleBlocks); blockContent = structuredClone(sampleContent); notationAssets = {}; selectedId = 1; transpose = 0 }

	async function printDocument() {
		// L'impression est toujours basée sur la vue lisible, jamais sur les sources brutes.
		previewMode = 'rendered'
		await tick()
		window.print()
	}

	function plainTextDocument() {
		return blocks
			.map((block, index) => `--- ${index + 1}. ${block.label || 'Sans titre'} — ${block.type === 'chordpro' ? 'ChordPro' : 'ABC'} ---\n${blockContent[block.id] ?? ''}`)
			.join('\n\n')
	}

	function parse(source: string): Line[] {
		return source.split(/\r?\n/).map((source) => {
			if (!source.trim()) return { kind: 'empty' }
			const match = source.match(/^\{(start_of_(?:verse|chorus|bridge)(?::\s*([^}]+))?|comment:\s*([^}]+))\}$/i)
			if (match) return { kind: 'section', label: match[2] || match[3] || match[1].replace(/^start_of_/, '') }
			return /^\{.*\}$/.test(source.trim()) ? { kind: 'empty' } : { kind: 'line', source }
		})
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

<section class="composer" aria-labelledby="composer-title">
	<header><div><p class="eyebrow">Prototype local — aucune sauvegarde</p><h1 id="composer-title">Composer une feuille de répétition</h1><p class="intro">Assemble des sections ChordPro et des mini-partitions dans l’ordre du morceau.</p></div><div class="header-actions"><button class="button print-button" onclick={printDocument}>Imprimer / PDF</button><button class="button" onclick={reset}>Réinitialiser</button></div></header>

	<div class="workspace">
		<aside class="block-list" aria-label="Blocs du document">
			<div class="list-heading"><h2>Blocs</h2><span>{blocks.length}</span></div>
			<div class="blocks">{#each blocks as block, index (block.id)}<button class:selected={block.id === selectedId} class="block-card" onclick={() => { selectedId = block.id; transpose = 0 }}><span class="order">{index + 1}</span><span class="icon">{block.type === 'chordpro' ? 'Aa' : '𝄞'}</span><span><strong>{block.label || 'Sans titre'}</strong><small>{block.type === 'chordpro' ? 'Paroles et accords' : 'Mini-partition'}</small></span></button>{/each}</div>
			<div class="add-buttons"><button class="button" onclick={() => add('chordpro')}>+ Paroles / accords</button><button class="button" onclick={() => add('notation')}>+ Mini-partition vide</button><button class="button import-button" onclick={chooseScoreFile} disabled={importInProgress}>{importInProgress ? 'Conversion…' : 'Importer MusicXML / MXL'}</button></div>
			<input bind:this={scoreFileInput} class="file-input" type="file" accept=".musicxml,.xml,.mxl,application/vnd.recordare.musicxml+xml,application/xml" onchange={importScore} />
			{#if importError}<p class="import-error">{importError}</p>{/if}
		</aside>

		<section class="editor-panel">
			{#if selected}<div class="editor-heading"><div><p class="eyebrow">Édition du bloc</p><h2>{selected.type === 'chordpro' ? 'Paroles et accords (ChordPro)' : 'Mini-partition (ABC)'}</h2></div><div class="actions"><button class="button" title="Monter" onclick={() => move(-1)}>↑</button><button class="button" title="Descendre" onclick={() => move(1)}>↓</button><button class="button delete" onclick={remove} disabled={blocks.length === 1}>Supprimer</button></div></div>
				<label>Nom du bloc <input value={selected.label} oninput={(event) => updateBlock({ label: event.currentTarget.value })} /></label>
				{#if selected.type === 'chordpro'}<div class="tools"><label>Transposer l’aperçu <select bind:value={transpose}><option value={-5}>−5</option><option value={-4}>−4</option><option value={-3}>−3</option><option value={-2}>−2</option><option value={-1}>−1</option><option value={0}>0</option><option value={1}>+1</option><option value={2}>+2</option><option value={3}>+3</option><option value={4}>+4</option><option value={5}>+5</option></select></label><button class="button apply" onclick={applyTranspose} disabled={!transpose}>Appliquer</button></div>{/if}
				<textarea bind:this={editor} value={selectedSource} oninput={(event) => updateSource(event.currentTarget.value)} spellcheck="false" aria-label="Source du bloc"></textarea>
				{#if selected.type === 'chordpro'}<div class="chords">{#each chords as chord}<button onclick={() => insertChord(chord)}>{chord}</button>{/each}</div>{:else}
					{#if notationAssets[selected.id]}
						<div class="original-file"><span><strong>Original conservé :</strong> {notationAssets[selected.id].file.name} ({notationAssets[selected.id].format.toUpperCase()})</span><button class="button" onclick={() => downloadOriginal(selected.id)}>Télécharger</button></div>
						{#if notationAssets[selected.id].warning}<p class="conversion-warning">Conversion ABC : {notationAssets[selected.id].warning}</p>{/if}
					{:else}<p class="hint">ABC : définis la mesure (`M:`), la durée (`L:`), la tonalité (`K:`), puis les notes. Les accords se placent entre guillemets.</p>{/if}
				{/if}
			{/if}
		</section>

		<section class="preview" aria-live="polite">
			<div class="preview-heading"><div><p class="eyebrow">Aperçu assemblé</p><h2>Partition en cours de composition</h2><p>Prototype de liste de blocs</p></div><div class="preview-tabs"><button class:active={previewMode === 'rendered'} onclick={() => previewMode = 'rendered'} aria-pressed={previewMode === 'rendered'}>Mis en forme</button><button class:active={previewMode === 'text'} onclick={() => previewMode = 'text'} aria-pressed={previewMode === 'text'}>Texte brut</button></div></div>
			{#if notationLoadError}<p class="abc-error load-error">{notationLoadError}</p>{/if}
			{#if previewMode === 'text'}
				<pre class="plain-text">{plainTextDocument()}</pre>
			{:else}
				{#each blocks as block (block.id)}<section class="rendered"><div class="caption"><span>{block.type === 'chordpro' ? 'Paroles / accords' : 'Mini-partition'}</span><strong>{block.label || 'Sans titre'}</strong></div>{#if block.type === 'chordpro'}<div class="chart">{#each parse(blockContent[block.id] ?? '') as line}{#if line.kind === 'section'}<h3>{line.label}</h3>{:else if line.kind === 'line'}<p class="chart-line">{#each tokens(line.source) as token}<span class="token"><span class="chord">{token.chord ? transposed(token.chord, block.id === selectedId ? transpose : 0) : ' '}</span><span class="lyric">{token.text || ' '}</span></span>{/each}</p>{:else}<div class="space"></div>{/if}{/each}</div>{:else}{#if abcErrors[block.id]}<p class="abc-error">{abcErrors[block.id]}</p>{/if}<div class="abc-output" use:abcTarget={block}></div>{/if}</section>{/each}
			{/if}
		</section>
	</div>
</section>

<style>
	.composer { max-width: 1400px; margin: 2rem auto 4rem; padding: 0 1rem; color: var(--color-text); } header { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; margin-bottom: 1.5rem; } .header-actions { display: flex; flex-wrap: wrap; gap: .5rem; justify-content: flex-end; } .print-button { color: #fff; background: var(--color-accent); border-color: var(--color-accent); } h1 { font-size: clamp(1.5rem, 3vw, 2rem); margin: .15rem 0 .35rem; } h2 { margin: 0; font-size: 1rem; } p { margin: 0; }
	.eyebrow { color: var(--color-text-muted); font-size: var(--text-xs); font-weight: 700; letter-spacing: .08em; text-transform: uppercase; } .intro { color: var(--color-text-secondary); max-width: 48rem; } .button, .chords button { border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: .4rem .65rem; color: var(--color-text); background: var(--color-bg); font: inherit; cursor: pointer; } .button:hover:not(:disabled), .chords button:hover { background: var(--color-bg-subtle); } button:disabled { opacity: .45; cursor: not-allowed; }
	.workspace { display: grid; grid-template-columns: 230px minmax(300px, .85fr) minmax(350px, 1.15fr); align-items: start; border: 1px solid var(--color-border-light); border-radius: var(--radius); background: var(--color-bg); overflow: hidden; } .block-list { padding: .75rem; border-right: 1px solid var(--color-border-light); background: var(--color-bg-subtle); } .list-heading { display: flex; justify-content: space-between; padding: .25rem .25rem .7rem; } .list-heading span { color: var(--color-text-muted); }
	.blocks { display: grid; gap: .35rem; } .block-card { display: grid; grid-template-columns: 1.3rem 1.45rem 1fr; gap: .4rem; align-items: center; width: 100%; padding: .55rem .45rem; border: 1px solid transparent; border-radius: var(--radius-sm); color: var(--color-text); background: transparent; text-align: left; cursor: pointer; } .block-card:hover { background: var(--color-bg); } .block-card.selected { border-color: var(--color-accent); background: var(--color-bg); } .order { color: var(--color-text-muted); font: var(--text-xs) ui-monospace, monospace; text-align: center; } .icon { color: var(--color-accent); font-weight: 700; } .block-card strong, .block-card small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .block-card strong { font-size: var(--text-sm); } .block-card small { color: var(--color-text-muted); font-size: var(--text-xs); } .add-buttons { display: grid; gap: .45rem; margin-top: 1rem; } .add-buttons .button { text-align: left; font-size: var(--text-sm); } .import-button { border-style: dashed; color: var(--color-accent); } .file-input { display: none; } .import-error { margin: .7rem .15rem 0; color: #b42318; font-size: var(--text-xs); line-height: 1.4; }
	.editor-panel { min-width: 0; border-right: 1px solid var(--color-border-light); } .editor-heading, .preview-heading { display: flex; justify-content: space-between; gap: .75rem; align-items: flex-start; padding: 1rem; border-bottom: 1px solid var(--color-border-light); } .actions { display: flex; gap: .35rem; } .actions .button { padding: .25rem .45rem; } .delete { color: #b42318; } .editor-panel > label { display: grid; gap: .3rem; padding: .8rem 1rem .4rem; color: var(--color-text-secondary); font-size: var(--text-xs); font-weight: 700; text-transform: uppercase; letter-spacing: .04em; } input, select { border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: .4rem .5rem; color: var(--color-text); background: var(--color-bg); font: inherit; text-transform: none; letter-spacing: normal; }
	.tools { display: flex; align-items: center; gap: .55rem; padding: .35rem 1rem .65rem; color: var(--color-text-secondary); font-size: var(--text-xs); } .tools label { display: flex; align-items: center; gap: .4rem; } .apply { color: #fff; background: var(--color-accent); border-color: var(--color-accent); } textarea { display: block; box-sizing: border-box; width: calc(100% - 2rem); min-height: 20rem; margin: .2rem 1rem .8rem; resize: vertical; border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: .7rem; color: var(--color-text); background: var(--color-bg-subtle); font: .82rem/1.55 ui-monospace, monospace; } .chords { display: flex; flex-wrap: wrap; gap: .35rem; padding: 0 1rem 1rem; } .chords button { color: var(--color-accent); padding: .2rem .45rem; border-radius: 999px; font: 600 var(--text-xs)/1.2 ui-monospace, monospace; } .hint, .conversion-warning { margin: 0 1rem 1rem; color: var(--color-text-muted); font-size: var(--text-sm); line-height: 1.45; } .original-file { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: .5rem; margin: 0 1rem .55rem; padding: .6rem; border: 1px solid var(--color-border-light); border-radius: var(--radius-sm); color: var(--color-text-secondary); font-size: var(--text-sm); } .original-file strong { color: var(--color-text); } .conversion-warning { color: #9a6700; }
	.preview { min-width: 0; background: #fffefb; } .preview-heading { display: flex; } .preview-heading h2 { margin-top: .2rem; font-size: 1.25rem; } .preview-heading > div > p:last-child { margin-top: .1rem; color: var(--color-text-muted); font-size: var(--text-xs); } .preview-tabs { display: flex; border: 1px solid var(--color-border); border-radius: var(--radius-sm); overflow: hidden; } .preview-tabs button { border: 0; border-right: 1px solid var(--color-border); padding: .3rem .45rem; color: var(--color-text-secondary); background: var(--color-bg); font: var(--text-xs) inherit; cursor: pointer; } .preview-tabs button:last-child { border-right: 0; } .preview-tabs button.active { color: #fff; background: var(--color-accent); } .plain-text { margin: 0; padding: 1rem; min-height: 24rem; overflow: auto; color: var(--color-text); background: var(--color-bg-subtle); font: .8rem/1.55 ui-monospace, monospace; white-space: pre-wrap; } .rendered { padding: .8rem 1rem; border-bottom: 1px solid var(--color-border-light); } .caption { display: flex; gap: .45rem; align-items: baseline; margin-bottom: .55rem; } .caption span { color: var(--color-text-muted); font-size: var(--text-xs); } .caption strong { font-size: var(--text-sm); } .chart h3 { margin: .65rem 0 .3rem; color: var(--color-accent); font-size: var(--text-sm); text-transform: uppercase; letter-spacing: .06em; } .chart h3:first-child { margin-top: 0; } .chart-line { min-height: 2.65rem; white-space: pre-wrap; line-height: 1.35; } .token { display: inline-flex; flex-direction: column; vertical-align: bottom; } .chord { min-height: 1.2rem; color: var(--color-accent); font: 700 .78rem/1.15 ui-monospace, monospace; } .lyric { min-height: 1.35rem; white-space: pre-wrap; } .space { height: .55rem; } .abc-output { overflow-x: auto; } .abc-output :global(svg) { max-width: 100%; height: auto; } .abc-error { margin-bottom: .5rem; color: #b42318; font-size: var(--text-sm); } .load-error { margin: .75rem 1rem 0; }
	@media (max-width: 1050px) { .workspace { grid-template-columns: 210px 1fr; } .preview { grid-column: 1 / -1; border-top: 1px solid var(--color-border-light); } .rendered { max-width: 760px; margin: auto; } } @media (max-width: 650px) { header { flex-direction: column; } .workspace { grid-template-columns: 1fr; } .block-list, .editor-panel { border-right: 0; border-bottom: 1px solid var(--color-border-light); } .blocks, .add-buttons { grid-template-columns: repeat(2, minmax(0, 1fr)); } }

	@page { size: A4; margin: 12mm; }
	@media print {
		:global(.app-top-bar), :global(.app-sidebar), :global(.breadcrumb), :global(.mini-player), :global(.group-switch-banner), :global(.no-group-banner) { display: none !important; }
		:global(.app-body), :global(.app-content) { display: block !important; margin: 0 !important; padding: 0 !important; background: #fff !important; }
		.composer { max-width: none; margin: 0; padding: 0; color: #000; }
		.composer > header, .block-list, .editor-panel, .preview-tabs, .load-error { display: none !important; }
		.workspace { display: block; border: 0; border-radius: 0; overflow: visible; background: #fff; }
		.preview { display: block; background: #fff; }
		.preview-heading { padding: 0 0 5mm; border-bottom: 1px solid #222; }
		.preview-heading h2 { font-size: 16pt; }
		.rendered { break-inside: avoid; page-break-inside: avoid; padding: 5mm 0; border-bottom-color: #bbb; }
		.caption { margin-bottom: 3mm; }
		.chart h3 { color: #000; }
		.chord { color: #000; }
		.abc-output { overflow: visible; }
		.abc-output :global(svg) { display: block; max-width: 100%; }
	}
</style>
