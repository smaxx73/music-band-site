<script lang="ts">
	import { goto, afterNavigate } from '$app/navigation'
	import {
		notificationIcon,
		notificationLabel,
		type ActivityNotification,
		type NotificationFeed
	} from '$lib/types'

	let { initialUnread = 0 }: { initialUnread?: number } = $props()

	let open = $state(false)
	let unreadOnly = $state(true)
	let items = $state<ActivityNotification[]>([])
	let loading = $state(false)
	let loadError = $state<string | null>(null)
	let root = $state<HTMLDivElement | null>(null)

	// Le serveur recompte la pastille à chaque navigation et fait foi. `localUnread`
	// ne porte que les actions faites depuis le menu — marquages, sondage — pour
	// éviter de recharger la page, et s'efface dès que le serveur se prononce.
	let localUnread = $state<number | null>(null)
	const unread = $derived(localUnread ?? initialUnread)

	$effect(() => {
		initialUnread
		localUnread = null
	})

	afterNavigate(() => { open = false })

	async function load() {
		loading = true
		loadError = null
		try {
			const params = new URLSearchParams({ limit: '20' })
			if (unreadOnly) params.set('unread', '1')
			const res = await fetch(`/api/notifications?${params}`)
			const body = await res.json()
			if (!res.ok) {
				loadError = body.error ?? 'Erreur.'
				return
			}
			const feed = body as NotificationFeed
			items = feed.items
			localUnread = feed.unread_count
		} catch {
			loadError = 'Erreur réseau.'
		} finally {
			loading = false
		}
	}

	/** Rafraîchit la pastille sans ouvrir le menu : une seule ligne suffit à la recompter. */
	async function refreshCount() {
		try {
			const res = await fetch('/api/notifications?limit=1')
			if (!res.ok) return
			localUnread = ((await res.json()) as NotificationFeed).unread_count
		} catch {
			// Hors ligne ou onglet en cours de fermeture : la pastille reste sur sa valeur.
		}
	}

	// Sondage discret : sans temps réel, c'est le compromis le plus simple pour que
	// la pastille bouge pendant qu'on reste sur la même page.
	$effect(() => {
		const timer = setInterval(() => { if (!open) refreshCount() }, 60_000)
		return () => clearInterval(timer)
	})

	function toggle() {
		open = !open
		if (open) load()
	}

	async function setRead(notification: ActivityNotification, read: boolean) {
		const res = await fetch(`/api/notifications/${notification.id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ read })
		})
		if (!res.ok) return
		const body = await res.json()
		localUnread = body.unread_count
		// Sous filtre « non lues », marquer comme lu retire la ligne de la liste.
		items = unreadOnly && read
			? items.filter((n) => n.id !== notification.id)
			: items.map((n) => (n.id === notification.id ? body.notification : n))
	}

	async function markAllRead() {
		const res = await fetch('/api/notifications', {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ read: true })
		})
		if (!res.ok) return
		localUnread = 0
		items = unreadOnly
			? []
			: items.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() }))
	}

	// Ouvrir une notification vaut lecture. On attend le marquage avant de naviguer :
	// la page suivante recompte la pastille côté serveur, et la trouverait sinon en retard.
	async function openNotification(event: MouseEvent, notification: ActivityNotification) {
		event.preventDefault()
		if (!notification.read_at) await setRead(notification, true)
		open = false
		goto(notification.link)
	}

	function switchFilter(value: boolean) {
		if (unreadOnly === value) return
		unreadOnly = value
		load()
	}

	function relativeTime(iso: string): string {
		const date = new Date(iso)
		if (!Number.isFinite(date.getTime())) return ''

		const minutes = Math.round((Date.now() - date.getTime()) / 60_000)
		if (minutes < 1) return "à l'instant"
		if (minutes < 60) return `il y a ${minutes} min`
		if (minutes < 24 * 60) return `il y a ${Math.floor(minutes / 60)} h`
		if (minutes < 48 * 60) return 'hier'
		if (minutes < 7 * 24 * 60) return `il y a ${Math.floor(minutes / (24 * 60))} j`
		return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
	}
</script>

<svelte:window
	onkeydown={(e) => { if (e.key === 'Escape') open = false }}
	onclick={(e) => {
		if (open && root && !root.contains(e.target as Node)) open = false
	}}
/>

<div class="notif" bind:this={root}>
	<button
		class="notif-bell"
		class:has-unread={unread > 0}
		onclick={toggle}
		aria-expanded={open}
		aria-haspopup="menu"
		title={unread > 0 ? `${unread} notification${unread > 1 ? 's' : ''} non lue${unread > 1 ? 's' : ''}` : 'Notifications'}
		aria-label="Notifications"
	>
		<span aria-hidden="true">🔔</span>
		{#if unread > 0}
			<span class="notif-badge">{unread > 9 ? '9+' : unread}</span>
		{/if}
	</button>

	{#if open}
		<div class="notif-panel" role="menu">
			<div class="notif-head">
				<strong>Notifications</strong>
				<button
					class="notif-mark-all"
					onclick={markAllRead}
					disabled={unread === 0}
				>Tout marquer comme lu</button>
			</div>

			<div class="notif-filters">
				<button class:active={unreadOnly} onclick={() => switchFilter(true)}>
					Non lues{unread > 0 ? ` (${unread})` : ''}
				</button>
				<button class:active={!unreadOnly} onclick={() => switchFilter(false)}>Toutes</button>
			</div>

			<div class="notif-list">
				{#if loading}
					<p class="notif-msg">Chargement…</p>
				{:else if loadError}
					<p class="notif-msg error">{loadError}</p>
				{:else if items.length === 0}
					<p class="notif-msg">
						{unreadOnly ? 'Aucune notification non lue.' : 'Aucune notification.'}
					</p>
				{:else}
					{#each items as item (item.id)}
						<div class="notif-item" class:unread={!item.read_at}>
							<a
								class="notif-link"
								href={item.link}
								onclick={(e) => openNotification(e, item)}
							>
								<span class="notif-icon" aria-hidden="true">{notificationIcon(item.type)}</span>
								<span class="notif-text">
									<span class="notif-action">
										{item.actor_name} {notificationLabel(item.type)}
									</span>
									{#if item.subject}<span class="notif-subject">{item.subject}</span>{/if}
									{#if item.excerpt}<span class="notif-excerpt">{item.excerpt}</span>{/if}
									<span class="notif-time">{relativeTime(item.created_at)}</span>
								</span>
							</a>
							<button
								class="notif-dot"
								onclick={() => setRead(item, !item.read_at)}
								title={item.read_at ? 'Marquer comme non lue' : 'Marquer comme lue'}
								aria-label={item.read_at ? 'Marquer comme non lue' : 'Marquer comme lue'}
							>{item.read_at ? '○' : '●'}</button>
						</div>
					{/each}
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.notif {
		position: relative;
		flex-shrink: 0;
	}

	.notif-bell {
		position: relative;
		width: 30px;
		height: 30px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		border-radius: 50%;
		color: #fff;
		font-size: 0.95rem;
		line-height: 1;
		cursor: pointer;
		opacity: 0.75;
		transition: background 0.1s, opacity 0.1s;
	}

	.notif-bell:hover,
	.notif-bell[aria-expanded='true'] {
		background: rgba(255, 255, 255, 0.12);
		opacity: 1;
	}

	.notif-bell.has-unread { opacity: 1; }

	.notif-badge {
		position: absolute;
		top: -1px;
		right: -2px;
		min-width: 15px;
		height: 15px;
		padding: 0 3px;
		border-radius: 8px;
		background: var(--color-accent);
		color: #fff;
		font-size: 0.6rem;
		font-weight: 700;
		line-height: 15px;
		text-align: center;
	}

	.notif-panel {
		position: absolute;
		top: calc(100% + 6px);
		right: 0;
		z-index: 110;
		width: 340px;
		max-width: calc(100vw - 1.4rem);
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-modal);
		overflow: hidden;
	}

	.notif-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		padding: 0.55rem 0.7rem;
		border-bottom: 1px solid var(--color-border-light);
		font-size: var(--text-sm);
	}

	.notif-mark-all {
		background: transparent;
		border: none;
		padding: 0;
		font-family: inherit;
		font-size: var(--text-xs);
		color: var(--color-accent);
		cursor: pointer;
	}

	.notif-mark-all:disabled {
		color: var(--color-text-muted);
		opacity: var(--disabled-opacity);
		cursor: not-allowed;
	}

	.notif-filters {
		display: flex;
		gap: var(--space-1);
		padding: 0.45rem 0.7rem;
		border-bottom: 1px solid var(--color-border-light);
		background: var(--color-bg-subtle);
	}

	.notif-filters button {
		padding: 0.15rem 0.5rem;
		border: 1px solid transparent;
		border-radius: var(--radius-md);
		background: transparent;
		font-family: inherit;
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
		cursor: pointer;
	}

	.notif-filters button.active {
		background: var(--color-bg);
		border-color: var(--color-border);
		color: var(--color-text);
		font-weight: 600;
	}

	.notif-list {
		max-height: min(60vh, 380px);
		overflow-y: auto;
	}

	.notif-msg {
		margin: 0;
		padding: 1rem 0.7rem;
		font-size: var(--text-sm);
		color: var(--color-text-muted);
		text-align: center;
	}

	.notif-msg.error { color: var(--color-error); }

	.notif-item {
		display: flex;
		align-items: flex-start;
		border-bottom: 1px solid var(--color-border-light);
	}

	.notif-item:last-child { border-bottom: none; }

	.notif-item.unread { background: var(--color-accent-light); }

	.notif-link {
		flex: 1;
		min-width: 0;
		display: flex;
		gap: 0.5rem;
		padding: 0.5rem 0.2rem 0.55rem 0.7rem;
		color: inherit;
		text-decoration: none;
	}

	.notif-link:hover { background: rgba(0, 0, 0, 0.03); }

	.notif-icon {
		flex-shrink: 0;
		width: 1.1rem;
		text-align: center;
		font-size: 0.8rem;
		line-height: 1.5;
		opacity: 0.7;
	}

	.notif-text {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.notif-action {
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
	}

	.notif-subject {
		font-size: var(--text-sm);
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.notif-excerpt {
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.notif-time {
		margin-top: 2px;
		font-size: 0.68rem;
		color: var(--color-text-muted);
	}

	.notif-dot {
		flex-shrink: 0;
		width: 26px;
		align-self: stretch;
		background: transparent;
		border: none;
		color: var(--color-accent);
		font-size: 0.6rem;
		cursor: pointer;
		opacity: 0.75;
	}

	.notif-dot:hover { opacity: 1; }

	@media (max-width: 640px) {
		.notif-panel {
			position: fixed;
			top: 44px;
			right: 0.4rem;
			width: auto;
			left: 0.4rem;
		}
	}
</style>
