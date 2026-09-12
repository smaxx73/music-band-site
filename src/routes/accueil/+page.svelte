<script lang="ts">
	// Toujours accessible, connecté ou non (voir +layout.server.ts). Connecté, elle
	// s'affiche dans la coquille applicative habituelle, sans bouton de connexion.
	import type { PageData } from './$types'
	import PublicLanding from '$lib/components/PublicLanding.svelte'

	let { data }: { data: PageData } = $props()
</script>

<svelte:head>
	<title>BandStash</title>
</svelte:head>

<PublicLanding loggedIn={!!data.user} />
