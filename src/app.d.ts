// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			user: {
				id: number
				name: string
				role: 'admin' | 'user'
				current_group_id: number | null
				groups: { id: number; name: string; role: 'admin' | 'member' }[]
			} | null
		}
		interface PageData {
			user?: {
				id: number
				name: string
				role: 'admin' | 'user'
				current_group_id: number | null
				groups: { id: number; name: string; role: 'admin' | 'member' }[]
			} | null
		}
		// interface PageState {}
		// interface Platform {}
	}
}

export {}
