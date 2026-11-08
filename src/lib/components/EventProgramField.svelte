<script lang="ts">
	import SetlistSongs from '$lib/components/SetlistSongs.svelte'
	import type { EventProgramSong, ProgramSetlist } from '$lib/types'

	let {
		songs,
		setlists,
		value = $bindable([]),
		placeholder = 'Ajouter un morceau…'
	}: {
		/** Ce qu'on peut programmer : le référentiel du groupe, sans les morceaux abandonnés. */
		songs: EventProgramSong[]
		setlists: ProgramSetlist[]
		value?: EventProgramSong[]
		placeholder?: string
	} = $props()

	const isChosen = (id: number) => value.some((chosen) => chosen.id === id)
	const remaining = $derived(songs.filter((song) => !isChosen(song.id)))
	// Une setlist déjà tout entière au programme n'apporterait rien : elle ne se propose pas.
	const addableSetlists = $derived(setlists.filter((setlist) => setlist.song_ids.some((id) => !isChosen(id))))

	function add(event: Event & { currentTarget: HTMLSelectElement }) {
		const select = event.currentTarget
		const song = songs.find((candidate) => candidate.id === Number(select.value))
		if (song) value = [...value, song]
		// Le choix passe dans la liste : le champ redevient libre pour le morceau suivant.
		select.value = ''
	}

	/** À la suite de ce qui est déjà choisi : reprendre une setlist n'efface rien. */
	function addSetlist(event: Event & { currentTarget: HTMLSelectElement }) {
		const select = event.currentTarget
		const setlist = setlists.find((candidate) => candidate.id === Number(select.value))
		if (setlist) {
			const added = setlist.song_ids
				.filter((id) => !isChosen(id))
				.flatMap((id) => songs.filter((song) => song.id === id))
			value = [...value, ...added]
		}
		select.value = ''
	}

	function move(from: number, to: number) {
		const next = [...value]
		next.splice(to, 0, ...next.splice(from, 1))
		value = next
	}

	function remove(id: number) {
		value = value.filter((song) => song.id !== id)
	}
</script>

<div class="field">
	{#if value.length > 0}
		<SetlistSongs
			items={value}
			editable
			surface="tray"
			removeLabel="du programme"
			showDuration={false}
			onReorder={move}
			onRemove={remove}
		/>
	{/if}
	<div class="pickers">
		<select class="form-input" onchange={add} aria-label="Ajouter un morceau au programme de travail">
			<option value="">{placeholder}</option>
			{#each remaining as song (song.id)}
				<option value={String(song.id)}>{song.song_title}</option>
			{/each}
		</select>
		{#if addableSetlists.length > 0}
			<select class="form-input" onchange={addSetlist} aria-label="Reprendre les morceaux d'une setlist">
				<option value="">Reprendre une setlist…</option>
				{#each addableSetlists as setlist (setlist.id)}
					<option value={String(setlist.id)}>{setlist.name}</option>
				{/each}
			</select>
		{/if}
	</div>
</div>

<style>
	.field {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.pickers {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}

	.pickers .form-input {
		flex: 1 1 14rem;
		min-width: 0;
	}
</style>
