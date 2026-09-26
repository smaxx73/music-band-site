<script lang="ts">
	import Icon from '$lib/components/Icon.svelte'
	import type { IconName } from '$lib/icons'

	// Visuel des pages qui rassemblent plusieurs morceaux (référentiel, playlist). Une
	// pochette de morceau — seule ou en mosaïque — ferait croire que la page parle de
	// lui : le visuel dit donc la nature de la page, pas son contenu. Il remplit son
	// conteneur.
	let { icon }: { icon: IconName } = $props()
</script>

<span class="icon-cover" aria-hidden="true"><Icon name={icon} size="2.2rem" /></span>

<style>
	.icon-cover {
		width: 100%;
		height: 100%;
		display: grid;
		place-items: center;
		background: linear-gradient(135deg, #4A4843, var(--color-ink));
		color: var(--color-paper);
	}
</style>
