// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			user: {
				id: number
				nickname: string
				first_name: string | null
				last_name: string | null
				display_name_format: 'nickname' | 'first_name' | 'first_name_last_initial' | 'first_name_last_name'
				display_name: string
				role: 'user' | 'admin' | 'superadmin'
				current_group_id: number | null
				groups: { id: number; name: string; role: 'admin' | 'member' }[]
			} | null
		}
		interface PageData {
			user?: {
				id: number
				nickname: string
				first_name: string | null
				last_name: string | null
				display_name_format: 'nickname' | 'first_name' | 'first_name_last_initial' | 'first_name_last_name'
				display_name: string
				role: 'user' | 'admin' | 'superadmin'
				current_group_id: number | null
				groups: { id: number; name: string; role: 'admin' | 'member' }[]
			} | null
		}
		// interface PageState {}
		// interface Platform {}
	}
}

export {}
