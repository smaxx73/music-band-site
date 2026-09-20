<script lang="ts">
	import { ICON_PATHS, type IconName } from '$lib/icons'

	let {
		name,
		size = '1.1em',
		label,
		class: className = ''
	}: {
		name: IconName
		size?: string
		/** Renseigné uniquement quand l'icône est seule à porter le sens : le tracé ne
		 *  se lit pas à voix haute. Accompagnée d'un mot, elle reste décorative. */
		label?: string
		class?: string
	} = $props()
</script>

<!-- Le tracé vient d'une table de constantes (`src/lib/icons.ts`) : jamais de donnée
     utilisateur ici, c'est ce qui rend le `{@html}` sans risque. -->
<svg
	class="icon {className}"
	viewBox="0 0 24 24"
	width={size}
	height={size}
	fill="none"
	stroke="currentColor"
	stroke-width="2"
	stroke-linecap="round"
	stroke-linejoin="round"
	role={label ? 'img' : undefined}
	aria-label={label}
	aria-hidden={label ? undefined : 'true'}
	focusable="false"
>{@html ICON_PATHS[name]}</svg>

<style>
	/* Alignée sur le texte qu'elle accompagne, et jamais compressée par un flex parent. */
	.icon {
		flex-shrink: 0;
		vertical-align: -0.15em;
	}
</style>
