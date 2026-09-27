<script lang="ts">
	import { formatDateOnly, toDateOnly } from '$lib/date'

	type SessionType = 'repetition' | 'concert' | 'studio' | 'autre'

	// Une session n'a pas de pochette : son visuel est un feuillet d'éphéméride, teinté
	// comme son type l'est partout ailleurs (badges, agenda). Il remplit son conteneur.
	let { date, type }: { date: string | Date; type: SessionType } = $props()

	const month = $derived(formatDateOnly(date, { month: 'short' }).replace('.', ''))
	const day = $derived(formatDateOnly(date, { day: 'numeric' }))
	const weekday = $derived(formatDateOnly(date, { weekday: 'short' }).replace('.', ''))
	// L'en-tête ne répète pas la date : le feuillet est seul à la porter. L'année n'y
	// figure qu'hors de l'année en cours, comme dans l'horodatage d'un commentaire.
	const year = $derived(toDateOnly(date).slice(0, 4))
	const showYear = $derived(year !== String(new Date().getFullYear()))
	const fullDate = $derived(
		formatDateOnly(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
	)
</script>

<span class="session-cover type-{type}" role="img" aria-label={fullDate}>
	<span class="month">{month}{#if showYear}&nbsp;{year}{/if}</span>
	<span class="day">{day}</span>
	<span class="weekday">{weekday}</span>
</span>

<style>
	.session-cover {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		container-type: size;
		color: #fff;
		line-height: 1;
		user-select: none;
		background: linear-gradient(135deg, var(--from), var(--to));
	}

	/* Mêmes familles de couleur que `.type-badge` et l'agenda, assombries pour porter
	   du blanc. */
	.type-repetition { --from: #E25E36; --to: #A93A1A; }
	.type-concert    { --from: #5A9E6F; --to: #2F6B42; }
	.type-studio     { --from: #8B5CF6; --to: #5B21B6; }
	.type-autre      { --from: #8C857A; --to: #5A554D; }

	.month,
	.weekday {
		font-size: 13cqmin;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		opacity: 0.85;
	}

	.day {
		font-size: 44cqmin;
		font-weight: 700;
		letter-spacing: -0.03em;
		margin: 3cqmin 0;
		font-variant-numeric: tabular-nums;
	}
</style>
