<script lang="ts">
	// Toujours accessible, connecté ou non (voir +layout.server.ts). Connecté, elle
	// s'affiche dans la coquille applicative habituelle, sans bouton de connexion.
	import type { PageData } from './$types'
	import PublicLanding from '$lib/components/PublicLanding.svelte'

	let { data }: { data: PageData } = $props()

	const groupName = $derived(
		data.user?.groups.find((g) => g.id === data.user?.current_group_id)?.name ?? null
	)
</script>

<svelte:head>
	<title>BandStash</title>
</svelte:head>

<PublicLanding loggedIn={!!data.user} userName={data.user?.display_name ?? null} {groupName} />
