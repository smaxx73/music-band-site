import type { PageServerLoad } from './$types'
import { redirect } from '@sveltejs/kit'
import sql from '$lib/server/db'
import { isAdmin } from '$lib/types'

// Consultation seule, portée sur le groupe actif — la gestion (renommer, membres)
// reste réservée aux admins via /admin/groups/[id].
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(302, '/login')
	if (!locals.user.current_group_id) return { group: null, members: [], canSeeGlobalRole: false }

	const groupId = locals.user.current_group_id

	const [group] = await sql`
		SELECT
			g.*,
			COUNT(DISTINCT ug.user_id)::int  AS member_count,
			COUNT(DISTINCT s.id)::int        AS song_count,
			COUNT(DISTINCT ses.id)::int      AS session_count,
			COUNT(DISTINCT p.id)::int        AS playlist_count
		FROM groups g
		LEFT JOIN user_groups ug  ON ug.group_id  = g.id
		LEFT JOIN songs s         ON s.group_id   = g.id
		LEFT JOIN sessions ses    ON ses.group_id  = g.id
		LEFT JOIN playlists p     ON p.group_id    = g.id
		WHERE g.id = ${groupId}
		GROUP BY g.id
	`

	// Le rôle global relève de l'administration des comptes, pas de la vie du groupe :
	// on ne l'expose qu'aux admins, et on ne le sélectionne pas du tout sinon —
	// le masquer côté client le laisserait lisible dans le payload de la page.
	const canSeeGlobalRole = isAdmin(locals.user.role)

	const members = await sql`
		SELECT
			u.id, u.display_name, ug.role AS group_role, ug.joined_at
			${canSeeGlobalRole ? sql`, u.role AS global_role` : sql``}
		FROM user_groups ug
		JOIN users u ON u.id = ug.user_id
		WHERE ug.group_id = ${groupId}
		ORDER BY u.display_name
	`

	return { group, members, canSeeGlobalRole }
}
