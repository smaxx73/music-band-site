<script lang="ts">
	import type { Snippet } from 'svelte'
	import { formatDateOnly } from '$lib/date'
	import { locationDetails, type Coords, type GroupPlace } from '$lib/places'
	import { SESSION_PHOTO_VEIL } from '$lib/session-photo'
	import MediaHeader from '$lib/components/MediaHeader.svelte'
	import SessionCover from '$lib/components/SessionCover.svelte'
	import Icon from '$lib/components/Icon.svelte'

	type SessionType = 'repetition' | 'concert' | 'studio' | 'autre'

	const typeHues: Record<SessionType, number | null> = {
		repetition: 14,
		concert: 138,
		studio: 262,
		autre: null
	}

	const typeLabels: Record<SessionType, string> = {
		repetition: 'Répétition',
		concert: 'Concert',
		studio: 'Studio',
		autre: 'Autre'
	}

	let {
		date,
		type,
		title,
		location,
		members,
		place = null,
		coords = null,
		photoUrl = null,
		veil = SESSION_PHOTO_VEIL.default,
		stats = null,
		actions,
		headingLevel = 1,
		linkLocation = true
	}: {
		date: string
		type: SessionType
		title: string | null
		location: string | null
		members: string[]
		place?: GroupPlace | null
		coords?: Coords | null
		photoUrl?: string | null
		veil?: number
		stats?: string | null
		actions?: Snippet
		headingLevel?: 1 | 2
		/** Une carte déjà cliquable ne doit pas contenir un second lien. */
		linkLocation?: boolean
	} = $props()
</script>

<MediaHeader
	title={title ?? formatDateOnly(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
	{stats}
	hue={typeHues[type]}
	photo={photoUrl}
	photoVeil={veil}
	{actions}
	{headingLevel}
>
	{#snippet kicker()}
		<span class="type-badge type-{type}">{typeLabels[type]}</span>
	{/snippet}
	{#snippet cover()}
		<SessionCover {date} {type} />
	{/snippet}
	{#if location}
		{@const details = locationDetails(location, place, coords)}
		<p class="meta location">
			<Icon name="pin" size="0.85rem" label="Lieu" class="location-icon" />
			{#if linkLocation && details.map}
				<a
					href={details.map}
					target="_blank"
					rel="noopener noreferrer"
					title={details.address ? `${details.address} — voir sur la carte` : 'Voir sur la carte'}
					>{location}</a>
			{:else}
				<span title={details.address ?? undefined}>{location}</span>
			{/if}
		</p>
	{/if}
	{#if members.length}
		<p class="meta">Présents : {members.join(', ')}</p>
	{/if}
</MediaHeader>

<style>
	.type-badge {
		font-size: inherit;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		padding: 0.15rem 0.5rem;
		border-radius: var(--radius-sm);
		white-space: nowrap;
	}

	.type-badge.type-repetition { background: var(--color-accent-light); color: var(--color-accent); }
	.type-badge.type-concert    { background: var(--color-green-light); color: var(--color-green); }
	.type-badge.type-studio     { background: #f3e8ff; color: #7c3aed; }
	.type-badge.type-autre      { background: var(--color-bg-subtle); color: var(--color-text-secondary); }

	.meta {
		font-size: 0.9rem;
		color: var(--color-text-secondary);
		margin: 0;
		overflow-wrap: anywhere;
	}

	.location {
		display: flex;
		align-items: flex-start;
		gap: 0.3rem;
	}

	.location :global(.location-icon) {
		flex-shrink: 0;
		margin-top: 0.2em;
	}

	.location a {
		color: inherit;
		text-decoration: underline dotted;
		text-underline-offset: 0.15em;
	}

	.location a:hover { text-decoration-style: solid; }
</style>
