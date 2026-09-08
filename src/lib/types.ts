export type UserRole = 'user' | 'admin' | 'superadmin'

export type User = {
	id: number
	name: string
	role: UserRole
	active: boolean
	created_at: Date
}

// Le superadmin a tous les pouvoirs d'un admin, plus la gestion des comptes admin/superadmin eux-mêmes.
export function isAdmin(role: UserRole | null | undefined): boolean {
	return role === 'admin' || role === 'superadmin'
}

export function isSuperadmin(role: UserRole | null | undefined): boolean {
	return role === 'superadmin'
}

export type GroupRole = 'admin' | 'member'

export type Group = {
	id: number
	name: string
	created_by: number | null
	created_at: Date
}

export type UserGroup = {
	user_id: number
	group_id: number
	role: GroupRole
	joined_at: Date
}

export type SongStatus = 'en_apprentissage' | 'au_repertoire' | 'abandonne'

export type Song = {
	id: number
	group_id: number
	title: string
	composer: string | null
	key: string | null
	lyrics: string | null
	music_notes: string | null
	status: SongStatus
	created_at: Date
}

export type Session = {
	id: number
	group_id: number
	date: string // DATE — ISO string "YYYY-MM-DD"
	location: string | null
	notes: string | null
	members: string[]
	created_by: string
	created_at: Date
}

export type Recording = {
	id: number
	session_id: number
	song_id: number
	take: number
	file_path: string
	duration_s: number | null
	status: string  // qualité libre : 'À revoir' | 'Moyen' | 'Bon' | 'Référence' | texte court
	notes: string | null
	uploaded_by: string
	created_at: Date
}

export type Comment = {
	id: number
	recording_id: number
	author: string
	content: string
	timestamp_s: number | null
	created_at: Date
}

export type ReactionValue = 1 | -1

export type CommentReaction = {
	comment_id: number
	user_id: number
	value: ReactionValue
	created_at: Date
}

// Commentaire enrichi des compteurs de réactions et de la réaction de l'utilisateur courant.
export type CommentWithReactions = Comment & {
	up_count: number
	down_count: number
	my_reaction: ReactionValue | null
}

export type Playlist = {
	id: number
	group_id: number
	name: string
	description: string | null
	created_by: string
	created_at: Date
	updated_at: Date | null
}

export type PlaylistItem = {
	id: number
	playlist_id: number
	recording_id: number
	position: number
	note: string | null
}

export type CalendarEventType = 'indisponibilite' | 'repetition' | 'concert'

export type CalendarEvent = {
	id: number
	group_id: number
	date: string
	type: CalendarEventType
	author: string
	title: string | null
	notes: string | null
	session_id: number | null
	created_at: Date
}
