export type UserRole = 'user' | 'admin' | 'superadmin'

export type User = {
	id: number
	nickname: string
	first_name: string | null
	last_name: string | null
	display_name_format: DisplayNameFormat
	display_name: string
	role: UserRole
	active: boolean
	created_at: Date
}

export type DisplayNameFormat =
	| 'nickname'
	| 'first_name'
	| 'first_name_last_initial'
	| 'first_name_last_name'

// Le superadmin a tous les pouvoirs d'un admin, plus la gestion des comptes admin/superadmin eux-mêmes.
export function isAdmin(role: UserRole | null | undefined): boolean {
	return role === 'admin' || role === 'superadmin'
}

export function isSuperadmin(role: UserRole | null | undefined): boolean {
	return role === 'superadmin'
}

export type GroupRole = 'admin' | 'member'

// Sous-ensemble de `locals.user` / `data.user` suffisant pour décider des droits.
// Structurel à dessein : les mêmes fonctions servent côté serveur et côté composant,
// ce qui évite qu'un écran affiche une action que l'API refusera.
export type RoleBearer = {
	id: number
	role: UserRole
	groups: { id: number; role: GroupRole }[]
}

// Rôle de l'utilisateur dans un groupe donné — null s'il n'en est pas membre.
export function memberGroupRole(
	user: RoleBearer | null | undefined,
	groupId: number | null | undefined
): GroupRole | null {
	if (!user || groupId == null) return null
	return user.groups.find((g) => g.id === groupId)?.role ?? null
}

// Consultation des informations d'un groupe (logo compris) : ses membres, et les
// admins globaux qui l'administrent depuis /admin sans forcément en faire partie.
export function canViewGroup(
	user: RoleBearer | null | undefined,
	groupId: number | null | undefined
): boolean {
	if (isAdmin(user?.role)) return true
	return memberGroupRole(user, groupId) !== null
}

// Administration d'un groupe : membres, nom, logo et liens, suppression du contenu
// d'autrui. Un admin global l'est sur tous les groupes, un admin de groupe sur le sien.
export function canManageGroup(
	user: RoleBearer | null | undefined,
	groupId: number | null | undefined
): boolean {
	if (isAdmin(user?.role)) return true
	return memberGroupRole(user, groupId) === 'admin'
}

// Le rôle d'admin de groupe ouvre l'accès aux membres d'un groupe : il n'est ni
// attribué ni retiré par un admin global, seulement par un superadmin. Même règle
// que pour les comptes admin/superadmin sur /admin/users.
export function canAssignGroupAdmin(user: RoleBearer | null | undefined): boolean {
	return isSuperadmin(user?.role)
}

// Supprimer un groupe emporte tout son contenu et les fichiers audio associés,
// sans reprise possible : c'est le seul acte du produit réservé au superadmin
// au-delà de la gestion des rôles.
export function canDeleteGroup(user: RoleBearer | null | undefined): boolean {
	return isSuperadmin(user?.role)
}

// Formate un volume d'octets pour l'affichage de l'impact d'une suppression.
export function formatBytes(bytes: number): string {
	if (bytes <= 0) return '0 octet'
	const units = ['octets', 'Ko', 'Mo', 'Go', 'To']
	const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
	const value = bytes / 1024 ** exponent
	return `${value.toFixed(exponent === 0 ? 0 : 1).replace('.', ',')} ${units[exponent]}`
}

// Suppression d'un contenu de groupe : son auteur, ou un administrateur du groupe.
// Un contenu dont l'auteur n'a pas pu être relié (migration 018) n'est supprimable
// que par un administrateur — on ne devine pas la propriété à partir du texte libre.
export function canDeleteGroupContent(
	user: RoleBearer | null | undefined,
	groupId: number | null | undefined,
	authorUserId: number | null | undefined
): boolean {
	if (!user) return false
	if (authorUserId != null && authorUserId === user.id) return true
	return canManageGroup(user, groupId)
}

export type Group = {
	id: number
	name: string
	created_by: number | null
	created_at: Date
	youtube_url: string | null
	facebook_url: string | null
	instagram_url: string | null
}

export type GroupLinkField = 'youtube_url' | 'facebook_url' | 'instagram_url'

export const GROUP_LINK_LABELS: Record<GroupLinkField, string> = {
	youtube_url: 'YouTube',
	facebook_url: 'Facebook',
	instagram_url: 'Instagram'
}

// La version (horodatage de mise à jour) change l'URL à chaque nouveau logo :
// le navigateur peut alors garder l'image en cache sans jamais servir l'ancienne.
export function groupLogoUrl(groupId: number, version: number): string {
	return `/api/groups/${groupId}/logo?v=${version}`
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
	release_year: number | null
	original_artist: string | null
	reference_duration_s: number | null
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
	created_by_user_id: number | null
	created_at: Date
}

export type Recording = {
	id: number
	session_id: number
	song_id: number
	take: number
	file_path: string
	/** Nom du fichier tel que déposé. NULL pour les prises antérieures à la migration 023. */
	source_file_name: string | null
	duration_s: number | null
	status: string  // qualité libre : 'À revoir' | 'Moyen' | 'Bon' | 'Référence' | texte court
	notes: string | null
	uploaded_by: string
	uploaded_by_user_id: number | null
	created_at: Date
}

export type Comment = {
	id: number
	recording_id: number
	author: string
	author_user_id: number | null
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
	created_by_user_id: number | null
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
	user_id: number | null
	date: string
	type: CalendarEventType
	author: string
	title: string | null
	notes: string | null
	session_id: number | null
	created_at: Date
}

// ─── Notifications d'activité ─────────────────────────────────────────────

export type NotificationType = 'recording' | 'comment' | 'session' | 'playlist' | 'agenda'

// Une notification appartient à un destinataire précis : il n'y a pas de droit à
// vérifier au-delà de `user_id`, mais l'affichage reste filtré par groupe actif.
export type ActivityNotification = {
	id: number
	type: NotificationType
	actor_name: string
	actor_user_id: number | null
	subject: string | null
	excerpt: string | null
	link: string
	read_at: string | null
	created_at: string
}

export type NotificationFeed = {
	items: ActivityNotification[]
	unread_count: number
}

// Libellé de l'action, sans le sujet — celui-ci est mis en valeur à part à l'écran.
export function notificationLabel(type: NotificationType): string {
	switch (type) {
		case 'recording': return 'a ajouté une prise'
		case 'comment': return 'a commenté'
		case 'session': return 'a créé une session'
		case 'playlist': return 'a créé la playlist'
		case 'agenda': return 'a ajouté un événement'
	}
}

export function notificationIcon(type: NotificationType): string {
	switch (type) {
		case 'recording': return '♪'
		case 'comment': return '💬'
		case 'session': return '◎'
		case 'playlist': return '≡'
		case 'agenda': return '◻'
	}
}

// Libellé des types de session, partagés avec l'agenda (`calendar_events.type`).
export function sessionTypeLabel(type: string): string {
	const labels: Record<string, string> = {
		repetition: 'Répétition',
		concert: 'Concert',
		studio: 'Studio',
		autre: 'Autre',
		indisponibilite: 'Indisponibilité'
	}
	return labels[type] ?? type
}

// ─── Outils audio : découpe d'un import sur les silences ──────────────────

/**
 * Réglages de la détection des silences. Exposés à l'écran de découpe : un
 * enregistrement bavard ou une batterie qui traîne ne se découpent pas au même
 * seuil qu'une répétition propre, et relancer l'analyse ne renvoie pas le fichier.
 */
export type SplitParams = {
	/** Seuil en dB sous lequel le signal compte comme du silence. */
	threshold_db: number
	/** Durée minimale d'un silence pour qu'il sépare deux prises. */
	min_silence_s: number
	/** En dessous, un passage sonore est du bruit de salle, pas une prise. */
	min_segment_s: number
	/**
	 * Marge rendue à chaque segment de part et d'autre. `silencedetect` coupe au seuil,
	 * or une fin de morceau passe sous le seuil bien avant d'être inaudible — cymbale
	 * qui traîne, réverb. Sans cette marge, la résonance est tranchée net.
	 */
	pad_s: number
}

export const SPLIT_DEFAULTS: SplitParams = {
	threshold_db: -40,
	min_silence_s: 2,
	min_segment_s: 10,
	pad_s: 0.25
}

export const SPLIT_BOUNDS: Record<keyof SplitParams, { min: number; max: number; step: number }> = {
	threshold_db: { min: -70, max: -15, step: 1 },
	min_silence_s: { min: 0.3, max: 15, step: 0.1 },
	min_segment_s: { min: 0, max: 300, step: 5 },
	pad_s: { min: 0, max: 5, step: 0.05 }
}

/**
 * Longueur minimale d'un segment, en dessous de laquelle ce n'est plus une prise.
 * Partagée : l'écran s'en sert pour borner un ajustement à la main, l'API pour refuser.
 */
export const MIN_SEGMENT_LENGTH_S = 1

/** Passage sonore repéré entre deux silences, en secondes depuis le début du fichier. */
export type AudioSegment = { start_s: number; end_s: number }

/**
 * Fichier déposé, pas encore devenu des prises. Voir `src/lib/server/imports.ts`.
 * L'original est conservé — c'est lui qui sera taillé ; l'analyse et la préécoute
 * passent par un proxy léger.
 */
export type AudioImport = {
	id: string
	session_id: number | null
	file_name: string
	/** Type de l'original conservé, tel que déposé. */
	source_mime: string | null
	duration_s: number | null
	/** Non nul = la découpe a été validée. L'original reste repris pendant la rétention. */
	consumed_at: Date | null
	created_at: Date
}
