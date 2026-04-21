export type UserRole = 'admin' | 'user'

export type User = {
	id: number
	name: string
	role: UserRole
	active: boolean
	created_at: Date
}

export type SongStatus = 'en_apprentissage' | 'au_repertoire' | 'abandonne'

export type Song = {
	id: number
	title: string
	composer: string | null
	key: string | null
	status: SongStatus
	created_at: Date
}

export type Session = {
	id: number
	date: string // DATE — ISO string "YYYY-MM-DD"
	location: string | null
	notes: string | null
	members: string[]
	created_by: string
	created_at: Date
}

export type RecordingStatus = 'en_cours' | 'au_point' | 'repertoire'

export type Recording = {
	id: number
	session_id: number
	song_id: number
	take: number
	file_path: string
	duration_s: number | null
	status: RecordingStatus
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

export type Playlist = {
	id: number
	name: string
	description: string | null
	created_by: string
	created_at: Date
}

export type PlaylistItem = {
	id: number
	playlist_id: number
	recording_id: number
	position: number
	note: string | null
}
