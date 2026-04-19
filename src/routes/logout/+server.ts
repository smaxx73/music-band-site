import type { RequestHandler } from './$types'
import { redirect } from '@sveltejs/kit'

export const POST: RequestHandler = ({ cookies }) => {
	cookies.delete('band_session', { path: '/' })
	redirect(302, '/login')
}
