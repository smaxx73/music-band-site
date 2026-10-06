<script lang="ts">
	import { goto, afterNavigate, invalidateAll } from '$app/navigation'
	import {
		notificationIcon,
		notificationLabel,
		type ActivityNotification,
		type NotificationFeed
	} from '$lib/types'
	import Icon from '$lib/components/Icon.svelte'
	import { daysFromToday } from '$lib/date'
	import Menu from '$lib/components/Menu.svelte'

	let { groupId, initialUnread = 0 }: { groupId: number; initialUnread?: number } = $props()

	let open = $state(false)
	let unreadOnly = $state(true)
	let items = $state<ActivityNotification[]>([])
	let loading = $state(false)
	let loadError = $state<string | null>(null)

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

	/**
	 * Appel à l'API pour le groupe dont ce menu affiche les notifications. Le groupe actif
	 * vit dans un cookie commun à tous les onglets : si un autre onglet a basculé, le
	 * serveur répond 409 et on recharge les données du layout — qui recrée ce menu sur
	 * le bon groupe — plutôt que d'afficher les notifications d'un autre groupe ici.
	 * Retourne null quand la réponse est à ignorer.
	 */
	async function api(path: string, init?: RequestInit): Promise<Response | null> {
		const separator = path.includes('?') ? '&' : '?'
		const res = await fetch(`${path}${separator}group_id=${groupId}`, init)
		if (res.status === 409) {
			open = false
			await invalidateAll()
			return null
		}
		return res
	}

	async function load() {
		loading = true
		loadError = null
		try {
			const params = new URLSearchParams({ limit: '20' })
			if (unreadOnly) params.set('unread', '1')
			const res = await api(`/api/notifications?${params}`)
			if (!res) return
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
			const res = await api('/api/notifications?limit=1')
			if (!res?.ok) return
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
		const res = await api(`/api/notifications/${notification.id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ read })
		})
		// false seulement si l'onglet était périmé : un autre échec n'empêche pas d'ouvrir.
		if (!res) return false
		if (!res.ok) return true
		const body = await res.json()
		localUnread = body.unread_count
		// Sous filtre « non lues », marquer comme lu retire la ligne de la liste.
		items = unreadOnly && read
			? items.filter((n) => n.id !== notification.id)
			: items.map((n) => (n.id === notification.id ? body.notification : n))
		return true
	}

	async function markAllRead() {
		const res = await api('/api/notifications', {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ read: true })
		})
		if (!res?.ok) return
		localUnread = 0
		items = unreadOnly
			? []
			: items.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() }))
	}

	// Ouvrir une notification vaut lecture. On attend le marquage avant de naviguer :
	// la page suivante recompte la pastille côté serveur, et la trouverait sinon en retard.
	// Les données sont rechargées même si la page visée est déjà ouverte : sans temps
	// réel, c'est en cliquant la notification qu'on voit le commentaire qu'elle annonce.
	async function openNotification(event: MouseEvent, notification: ActivityNotification) {
		event.preventDefault()
		// Groupe changé entre-temps : le lien viserait un contenu d'un autre groupe.
		if (!notification.read_at && !(await setRead(notification, true))) return
		open = false
		goto(notification.link, { invalidateAll: true })
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
		// Au-delà de l'heure, on compte en jours civils : « hier » veut dire la veille au
		// calendrier, pas « entre 24 et 48 h » — 22 h l'avant-veille n'est pas « hier » à 1 h.
		const days = -daysFromToday(date)
		if (days <= 0) return `il y a ${Math.floor(minutes / 60)} h`
		if (days === 1) return 'hier'
		if (days < 7) return `il y a ${days} j`
		return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
	}
</script>

<div class="notif">
	<Menu
		bind:open
		role="dialog"
		label="Notifications"
		scrollIntoView={false}
		--menu-z="110"
		--menu-width="340px"
		--menu-max-width="calc(100vw - 1.4rem)"
		--menu-padding="0"
	>
		{#snippet trigger(menu)}
			<button
				{...menu}
				onclick={toggle}
				class="notif-bell"
				class:has-unread={unread > 0}
				title={unread > 0 ? `${unread} notification${unread > 1 ? 's' : ''} non lue${unread > 1 ? 's' : ''}` : 'Notifications'}
				aria-label="Notifications"
			>
				<Icon name="bell" size="1.05rem" />
				{#if unread > 0}
					<span class="notif-badge">{unread > 9 ? '9+' : unread}</span>
				{/if}
			</button>
		{/snippet}

		<div class="notif-head">
			<strong>Notifications</strong>
			<!-- Ce qui parvient se règle groupe par groupe, sur le profil. -->
			<a
				class="notif-settings"
				href="/profile#notifications-{groupId}"
				title="Régler mes notifications"
				aria-label="Régler mes notifications"
			><Icon name="settings" size="0.95rem" /></a>
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
							<Icon name={notificationIcon(item.type)} class="notif-icon" size="1rem" />
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

		<!-- On ouvre la cloche pour savoir « quoi de neuf » : le fil, qui n'a pas d'onglet
		     au téléphone, en est la réponse complète. La navigation referme le menu. -->
		<a class="notif-feed" href="/fil">
			Tout le fil d'actualité
			<Icon name="chevron-right" size="0.9rem" />
		</a>
	</Menu>
</div>

<style>
	.notif {
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
		border-radius: var(--radius-xl);
		background: var(--color-accent);
		color: #fff;
		font-size: 0.6rem;
		font-weight: 700;
		line-height: 15px;
		text-align: center;
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

	.notif-settings {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		margin-left: auto;
		border-radius: var(--radius-sm);
		color: var(--color-text-muted);
	}
	.notif-settings:hover { background: var(--color-bg-muted); color: var(--color-text); }

	.notif-feed {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.2rem;
		min-height: 40px;
		border-top: 1px solid var(--color-border-light);
		background: var(--color-bg-subtle);
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--color-accent-dark);
		text-decoration: none;
	}

	.notif-feed:hover { text-decoration: underline; }

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

	/* Rendue par Icon.svelte : le style scopé ne l'atteint qu'avec `:global`, tenu
	   sous `.notif-link` pour ne pas devenir une règle globale. */
	.notif-link :global(.notif-icon) {
		margin-top: 0.15rem;
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
		font-size: var(--text-2xs);
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

	/* Au téléphone, la cloche reste dans la barre du haut, avec une cible au pouce ; le
	   panneau descend sur toute la largeur, juste sous la barre. */
	@media (max-width: 640px) {
		.notif-bell {
			width: 44px;
			height: 44px;
		}

		.notif-bell :global(svg) {
			width: 1.35rem;
			height: 1.35rem;
		}

		/* Sur un bouton de 44 px, la pastille se recale contre l'icône. */
		.notif-badge {
			top: 7px;
			right: 6px;
		}

		/* Le panneau appartient à Menu.svelte : on l'atteint depuis la portée de la cloche.
		   Il descend de la barre du haut comme un store, bord à bord, et voile la page
		   sous lui sans assombrir la barre, qui garde la cloche allumée. L'ombre décalée
		   d'autant qu'elle s'étend part du haut du panneau : elle ne déborde que dessous,
		   barre d'onglets et mini-lecteur compris. Sa hauteur s'arrête au-dessus d'eux. */
		.notif :global(.menu-panel) {
			position: fixed;
			top: var(--top-bar-h);
			right: 0;
			left: 0;
			/* Bord à bord : la largeur et le plafond du bureau, passés à Menu en propriétés,
			   laisseraient sinon un vide à droite. Redéfinies sur le panneau lui-même, elles
			   l'emportent sur celles héritées du parent, quel que soit l'ordre des feuilles. */
			--menu-width: auto;
			--menu-max-width: none;
			max-height: calc(100dvh - var(--top-bar-h) - var(--footer-actions-h) - var(--mini-player-h) - 1rem);
			border: none;
			border-radius: 0 0 calc(var(--radius-xl) * 2) calc(var(--radius-xl) * 2);
			box-shadow: 0 100vmax 0 100vmax rgba(0, 0, 0, 0.45);
			/* Glisse depuis la barre, d'où il descend. */
			--menu-enter-y: -16px;
		}

		/* Ouvert, il fige la page derrière lui, comme une modale. */
		:global(html:has(.notif .menu-panel)) { overflow: hidden; }

		/* La liste prend la hauteur que le panneau lui laisse, sans plafond de bureau, et
		   son défilement ne se propage pas à la page au bout de la liste. */
		.notif-list {
			flex: 1;
			min-height: 0;
			max-height: none;
			overscroll-behavior: contain;
		}

		.notif-head {
			padding: 0.4rem 0.4rem 0.4rem 0.9rem;
			font-size: var(--text-lg);
		}

		/* Cibles au pouce : une action d'en-tête et une pastille de 26 px se ratent. */
		.notif-mark-all {
			min-height: 44px;
			padding: 0 0.5rem;
			font-size: var(--text-sm);
		}

		.notif-filters { padding: 0.5rem 0.9rem; }

		.notif-filters button {
			min-height: 36px;
			padding: 0 0.9rem;
			font-size: var(--text-sm);
		}

		.notif-link { padding: 0.7rem 0.2rem 0.75rem 0.9rem; gap: 0.7rem; }
		.notif-dot { width: 44px; font-size: 0.7rem; }

		.notif-settings {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		margin-left: auto;
		border-radius: var(--radius-sm);
		color: var(--color-text-muted);
	}
	.notif-settings:hover { background: var(--color-bg-muted); color: var(--color-text); }

	.notif-feed {
			min-height: 48px;
			font-size: var(--text-sm);
		}
	}
</style>
