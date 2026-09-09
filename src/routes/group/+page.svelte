<script lang="ts">
	import type { PageData } from './$types'
	import { formatDateOnly } from '$lib/date'
	import { isAdmin } from '$lib/types'

	let { data }: { data: PageData } = $props()

	const ROLE_LABELS: Record<string, string> = {
		user: 'Utilisateur',
		admin: 'Administrateur',
		superadmin: 'Super-admin'
	}

	const GROUP_ROLE_LABELS: Record<string, string> = {
		member: 'Membre',
		admin: 'Admin'
	}

	function formatCreatedAt(d: string | Date | null | undefined) {
		if (!d) return '—'
		return formatDateOnly(d, { day: 'numeric', month: 'long', year: 'numeric' })
	}
</script>

<svelte:head>
	<title>{data.group ? data.group.name : 'Mon groupe'}</title>
</svelte:head>

<main>
	<nav class="breadcrumb">
		<a href="/">Tableau de bord</a> /
		<span>Mon groupe</span>
	</nav>

	{#if !data.group}
		<h1>Mon groupe</h1>
		<p class="empty">Vous n'appartenez à aucun groupe actif.</p>
	{:else}
		<h1>{data.group.name}</h1>

		<!-- Informations -->
		<section class="section">
			<h2>Informations</h2>
			<dl class="info-list">
				<dt>Créé le</dt>
				<dd>{formatCreatedAt(data.group.created_at)}</dd>

				<dt>Membres</dt>
				<dd>{data.group.member_count}</dd>

				<dt>Morceaux</dt>
				<dd>{data.group.song_count}</dd>

				<dt>Sessions</dt>
				<dd>{data.group.session_count}</dd>

				<dt>Playlists</dt>
				<dd>{data.group.playlist_count}</dd>
			</dl>

			{#if isAdmin(data.user?.role)}
				<p class="admin-link">
					<a href="/admin/groups/{data.group.id}">Gérer ce groupe →</a>
				</p>
			{/if}
		</section>

		<!-- Membres -->
		<section class="section">
			<h2>Membres ({data.members.length})</h2>

			{#if data.members.length === 0}
				<p class="empty">Aucun membre.</p>
			{:else}
				<table class="data-table">
					<thead>
						<tr>
							<th>Nom</th>
							<th>Rôle dans le groupe</th>
							{#if data.canSeeGlobalRole}<th>Rôle global</th>{/if}
						</tr>
					</thead>
					<tbody>
						{#each data.members as m}
							<tr>
								<td class="name">{m.display_name}</td>
								<td>
									<span class="badge badge-group-{m.group_role}">
										{GROUP_ROLE_LABELS[m.group_role] ?? m.group_role}
									</span>
								</td>
								{#if data.canSeeGlobalRole}
									<td>
										<span class="badge badge-{m.global_role}">
											{ROLE_LABELS[m.global_role] ?? m.global_role}
										</span>
									</td>
								{/if}
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</section>
	{/if}
</main>

<style>
	main {
		max-width: 700px;
		margin: 2rem auto;
		padding: 0 1rem;
	}

	.breadcrumb {
		font-size: 0.85rem;
		color: #888;
		margin-bottom: 1.25rem;
	}
	.breadcrumb a { color: inherit; text-decoration: none; }
	.breadcrumb a:hover { text-decoration: underline; }

	h1 { font-size: var(--text-xl); margin-bottom: 2rem; }

	h2 {
		font-size: 1rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: #888;
		margin: 0 0 1rem;
		padding-bottom: 0.4rem;
		border-bottom: 1px solid #ebebeb;
	}

	.section { margin-bottom: 2.5rem; }

	.info-list {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.6rem 1.5rem;
		margin: 0 0 1rem;
	}

	.info-list dt {
		font-weight: 600;
		color: #666;
		font-size: 0.85rem;
	}

	.info-list dd { margin: 0; }

	.admin-link { font-size: 0.875rem; }
	.admin-link a { color: inherit; }

	table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }

	th {
		text-align: left;
		padding: 0.4rem 0.75rem;
		border-bottom: 2px solid #e0e0e0;
		font-size: 0.72rem;
		text-transform: uppercase;
		color: #666;
	}

	td {
		padding: 0.55rem 0.75rem;
		border-bottom: 1px solid #f0f0f0;
		vertical-align: middle;
	}

	.name { font-weight: 600; }

	.badge {
		display: inline-block;
		padding: 0.15rem 0.5rem;
		border-radius: 3px;
		font-size: 0.75rem;
		font-weight: 600;
	}

	.badge-superadmin { background: #fef3c7; color: #92400e; }
	.badge-admin { background: #e8f0fe; color: #1a56db; }
	.badge-user { background: #f0f0f0; color: #555; }
	.badge-group-admin { background: #e8f0fe; color: #1a56db; }
	.badge-group-member { background: #f0f0f0; color: #555; }

	.empty { color: #aaa; font-style: italic; font-size: 0.9rem; }
</style>
