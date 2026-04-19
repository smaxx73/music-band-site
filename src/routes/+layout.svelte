<script lang="ts">
	import type { LayoutData } from './$types'
	import favicon from '$lib/assets/favicon.svg'

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props()
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
