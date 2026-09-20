import type { PageServerLoad } from './$types'
import { redirect } from '@sveltejs/kit'
import { listSetlists } from '$lib/server/setlists'
import { loginRedirect } from '$lib/redirect'

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(302, loginRedirect(url))
	if (!locals.user.current_group_id) return { setlists: [] }

	return { setlists: await listSetlists(locals.user.current_group_id) }
}
