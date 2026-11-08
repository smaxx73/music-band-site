<script lang="ts">
	import type { PageData } from './$types'
	import { formatDateOnly, nearDayLabel } from '$lib/date'

	let { data }: { data: PageData } = $props()

	function dayLabel(day: string) {
		return nearDayLabel(day)?.toLowerCase() ?? formatDateOnly(day, { day: 'numeric', month: 'short' })
	}
</script>

<svelte:head>
	<title>Écoutes des prises</title>
</svelte:head>

<main class="page page-wide">
	<nav class="breadcrumb">
		<a href="/">Tableau de bord</a> /
		<a href="/group">Mon groupe</a> /
		<span>Écoutes des prises</span>
	</nav>

	<h1>Écoutes des prises</h1>

	<p class="form-hint intro">
		{#if data.groupName}{data.groupName}. {/if}Les membres ne voient que le nombre
		d'auditeurs d'une prise. Liste limitée aux {data.limit} prises écoutées le plus récemment.
	</p>

	{#if data.recordings.length === 0}
		<p class="form-hint">Aucune écoute enregistrée pour l'instant.</p>
	{:else}
		<div class="table-scroll">
			<table class="data-table">
				<thead>
					<tr>
						<th>Prise</th>
						<th>Session</th>
						<th>Auditeurs</th>
					</tr>
				</thead>
				<tbody>
					{#each data.recordings as recording (recording.recording_id)}
						<tr>
							<td><a href="/recording/{recording.recording_id}">{recording.song_title} — Prise {recording.take}</a></td>
							<td data-label="Session">{formatDateOnly(recording.session_date, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
							<td data-label="Auditeurs">
								{#each recording.listeners as listener, i}{i > 0 ? ', ' : ''}{listener.name} <span class="day">({dayLabel(listener.last_day)})</span>{/each}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</main>

<style>
	.intro { margin-bottom: 1rem; }
	.day { color: var(--color-text-muted); white-space: nowrap; }
</style>
