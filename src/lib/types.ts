import type { IconName } from '$lib/icons'
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

// Modification d'un commentaire : son auteur seul, admins compris. Supprimer le contenu
// d'autrui se justifie pour un admin ; lui faire dire autre chose, jamais. Un commentaire
// non relié à un compte (migration 018) n'est donc modifiable par personne.
export function canEditComment(
	user: RoleBearer | null | undefined,
	authorUserId: number | null | undefined
): boolean {
	return !!user && authorUserId != null && authorUserId === user.id
}

// Message d'une publication : même règle qu'un commentaire, c'est une parole signée.
export function canEditPost(
	user: RoleBearer | null | undefined,
	authorUserId: number | null | undefined
): boolean {
	return canEditComment(user, authorUserId)
}

// Lien d'écoute public (sans compte). Une prise est au groupe entier : tout membre peut
// la faire entendre au dehors. Un enregistrement perso, à son seul propriétaire. Les
// admins n'ont rien de plus : ils ne voient pas l'espace perso, et sur une prise ils
// ont déjà le droit de tout membre.
export function canSharePublicly(
	user: RoleBearer | null | undefined,
	owner: { groupId: number } | { userId: number }
): boolean {
	if (!user) return false
	if ('userId' in owner) return owner.userId === user.id
	return memberGroupRole(user, owner.groupId) !== null
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

/** Miniature JPEG du logo (512 px, quelques dizaines de Ko) : image d'aperçu des liens partagés. */
export function groupLogoThumbnailUrl(groupId: number, version: number): string {
	return `/api/groups/${groupId}/logo?v=${version}&size=thumb`
}

/** Image d'aperçu par défaut, quand le groupe n'a pas de logo : 512 px, ~25 Ko. */
export const DEFAULT_SHARE_IMAGE = '/brand/bandstash-og.jpg'

export type UserGroup = {
	user_id: number
	group_id: number
	role: GroupRole
	joined_at: Date
}

export type SongStatus =
	| 'en_apprentissage'
	| 'proposition_de_travail'
	| 'au_repertoire'
	| 'abandonne'

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

// Une prise a une piste audio, une vidéo YouTube, ou les deux.
export type Recording = {
	id: number
	session_id: number
	song_id: number
	take: number
	/** "{id}.mp3". NULL = pas de piste audio : vidéo seule, ni waveform ni playlist. */
	file_path: string | null
	/** Vidéo YouTube du morceau : identifiant seul. */
	youtube_video_id: string | null
	youtube_title: string | null
	/** Nom du fichier audio tel que déposé. NULL pour les prises antérieures à la migration 023. */
	source_file_name: string | null
	duration_s: number | null
	status: string  // qualité libre : 'À revoir' | 'Moyen' | 'Bon' | 'Référence' | texte court
	notes: string | null
	uploaded_by: string
	uploaded_by_user_id: number | null
	created_at: Date
}

/**
 * Ce qu'une liste de prises a besoin d'afficher : la prise, plus le nombre de
 * commentaires calculé par la requête. Les vues session et morceau sélectionnent des
 * colonnes différentes autour (auteur du contenu, date de session) : elles étendent ce
 * socle, que `RecordingRow.svelte` suffit à rendre.
 */
export type RecordingListItem = Pick<
	Recording,
	| 'id'
	| 'take'
	| 'status'
	| 'notes'
	| 'duration_s'
	| 'uploaded_by'
	| 'file_path'
	| 'source_file_name'
	| 'youtube_video_id'
	| 'youtube_title'
> & {
	comment_count: number
}

/**
 * Ce à quoi une discussion se rattache. Une prise — le cas d'origine, avec ses repères
 * de lecture —, une setlist, qui se discute sans qu'il y ait rien à écouter, ou une
 * publication. Toutes vivent dans la même table : mêmes réactions, mentions, édition.
 *
 * `anchorable` ne sert qu'aux publications : une suggestion de morceau sans vidéo n'a
 * rien à lire, donc rien où ancrer un commentaire. Une prise l'est toujours, une setlist
 * jamais.
 */
export type CommentThread =
	| { kind: 'recording' | 'setlist'; id: number }
	| { kind: 'post'; id: number; anchorable: boolean }

/** Page qui porte la discussion : c'est le lien d'un commentaire qu'on partage. */
export function threadHref(thread: CommentThread): string {
	switch (thread.kind) {
		case 'recording': return `/recording/${thread.id}`
		case 'setlist': return `/setlists/${thread.id}`
		case 'post': return `/posts/${thread.id}`
	}
}

/** Colonne — et donc champ d'API — qui nomme la cible dans `/api/comments`. */
export function threadParam(thread: CommentThread): 'recording_id' | 'setlist_id' | 'post_id' {
	switch (thread.kind) {
		case 'recording': return 'recording_id'
		case 'setlist': return 'setlist_id'
		case 'post': return 'post_id'
	}
}

/** Un commentaire peut-il porter un repère de lecture sur cette cible ? */
export function threadAnchorable(thread: CommentThread): boolean {
	if (thread.kind === 'post') return thread.anchorable
	return thread.kind === 'recording'
}

export type Comment = {
	id: number
	/** Exactement l'un des trois est renseigné (contrainte `comments_target`). */
	recording_id: number | null
	setlist_id: number | null
	post_id: number | null
	author: string
	author_user_id: number | null
	content: string
	timestamp_s: number | null
	created_at: Date
	/** NULL = jamais modifié. */
	edited_at: Date | null
}

export type ReactionValue = 1 | -1

export type CommentReaction = {
	comment_id: number
	user_id: number
	value: ReactionValue
	created_at: Date
}

/** Pouces d'un commentaire ou d'une publication, vus par l'utilisateur courant. */
export type ReactionSummary = {
	up_count: number
	down_count: number
	up_reactors: string[]
	down_reactors: string[]
	my_reaction: ReactionValue | null
}

// Commentaire enrichi des compteurs, des identités des votants et de la réaction courante.
export type CommentWithReactions = Comment & ReactionSummary

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

/**
 * Programme d'un concert ou d'une répétition : des morceaux du référentiel dans un
 * ordre voulu. Une playlist vise des prises à réécouter, une setlist des morceaux à jouer.
 */
export type Setlist = {
	id: number
	group_id: number
	name: string
	description: string | null
	created_by: string
	created_by_user_id: number | null
	created_at: Date
	updated_at: Date | null
}

export type SetlistItem = {
	id: number
	setlist_id: number
	song_id: number
	position: number
}

/** Une ligne de setlist telle qu'elle s'affiche : l'item, plus son morceau. */
export type SetlistItemView = SetlistItem & {
	song_title: string
	song_composer: string | null
	song_key: string | null
	song_status: SongStatus
	/** Durée de référence du morceau — `null` tant que personne ne l'a renseignée. */
	reference_duration_s: number | null
}

/**
 * Temps total d'une setlist : la somme des durées de référence connues. Les morceaux
 * qui n'en ont pas sont comptés à part plutôt que pour zéro — un total muet sur ce
 * qu'il ignore se lirait comme un total exact.
 */
export function setlistDuration(items: Pick<SetlistItemView, 'reference_duration_s'>[]): {
	total_s: number
	missing: number
} {
	let total_s = 0
	let missing = 0
	for (const item of items) {
		if (item.reference_duration_s == null) missing += 1
		else total_s += item.reference_duration_s
	}
	return { total_s, missing }
}

/** « 1 h 12 » / « 42 min » : une durée de programme se lit en minutes, pas en mm:ss. */
export function formatDurationLong(seconds: number): string {
	const total = Math.max(0, Math.round(seconds))
	const hours = Math.floor(total / 3600)
	const minutes = Math.round((total % 3600) / 60)
	if (hours === 0) return `${minutes} min`
	return minutes === 0 ? `${hours} h` : `${hours} h ${String(minutes).padStart(2, '0')}`
}

/**
 * « 42 min », précédé de « ≈ » dès qu'une durée manque : le total est alors un
 * plancher, et le signe le dit sans avoir à détailler ce qui manque.
 */
export function formatSetlistDuration(total: { total_s: number; missing: number }): string {
	if (total.total_s === 0) return total.missing > 0 ? 'durée inconnue' : '—'
	return `${total.missing > 0 ? '≈ ' : ''}${formatDurationLong(total.total_s)}`
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

export type NotificationType =
	| 'recording' | 'comment' | 'mention' | 'session' | 'playlist' | 'agenda' | 'setlist' | 'post'

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
		case 'mention': return "t'a mentionné sur"
		case 'session': return 'a créé une session'
		case 'playlist': return 'a créé la playlist'
		case 'agenda': return 'a ajouté un événement'
		case 'setlist': return 'a créé la setlist'
		case 'post': return 'a publié'
	}
}

export function notificationIcon(type: NotificationType): IconName {
	switch (type) {
		case 'recording': return 'music'
		case 'comment': return 'comment'
		case 'mention': return 'at'
		case 'session': return 'calendar'
		case 'playlist': return 'playlist'
		case 'agenda': return 'agenda'
		case 'setlist': return 'list'
		case 'post': return 'send'
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

// ─── Espace perso et publications ─────────────────────────────────────────

/**
 * Enregistrement de l'espace perso : à un utilisateur, jamais à un groupe. Même forme
 * qu'une prise — piste audio, vidéo YouTube, ou les deux — sans session ni morceau.
 */
export type PersonalRecording = {
	id: number
	user_id: number
	title: string
	notes: string | null
	/** "perso/{id}.mp3", relatif à AUDIO_DIR. NULL = vidéo seule. */
	file_path: string | null
	youtube_video_id: string | null
	youtube_title: string | null
	source_file_name: string | null
	duration_s: number | null
	file_hash: string | null
	created_at: Date
	updated_at: Date | null
}

/** URL d'écoute d'un enregistrement perso — servie par Node, jamais par Caddy. */
export function personalAudioUrl(id: number): string {
	return `/audio/perso/${id}.mp3`
}

// ─── Liens d'écoute publics ───────────────────────────────────────────────

/** Ce qu'un lien d'écoute ouvre : une prise du groupe, ou un enregistrement perso. */
export type ShareTarget = { kind: 'recording'; id: number } | { kind: 'personal'; id: number }

/** Durées proposées à la création. Un lien expire toujours : rien n'est ouvert pour de bon. */
export const SHARE_DURATIONS_DAYS = [7, 30, 180] as const
export type ShareDurationDays = (typeof SHARE_DURATIONS_DAYS)[number]
export const SHARE_DEFAULT_DAYS: ShareDurationDays = 180

export const SHARE_DURATION_LABELS: Record<ShareDurationDays, string> = {
	7: '1 semaine',
	30: '1 mois',
	180: '6 mois'
}

/** Un lien actif, tel que le voient les membres. Le jeton n'y est pas : seule son empreinte est gardée. */
export type ShareLinkView = {
	id: number
	created_at: string
	expires_at: string
	last_accessed_at: string | null
	created_by: string | null
}

export function shareUrl(origin: string, token: string): string {
	return `${origin}/ecoute/${token}`
}

export type PostType = 'recording' | 'youtube' | 'song_suggestion'

export const POST_TYPE_LABELS: Record<PostType, string> = {
	recording: 'Enregistrement',
	youtube: 'Vidéo',
	song_suggestion: 'Suggestion de morceau'
}

/** Publication telle qu'elle s'affiche : la ligne, plus ce qu'elle montre. */
export type PostView = {
	id: number
	group_id: number
	type: PostType
	message: string | null
	author: string
	author_user_id: number | null
	personal_recording_id: number | null
	youtube_video_id: string | null
	youtube_title: string | null
	song_title: string | null
	song_artist: string | null
	song_id: number | null
	created_at: string
	edited_at: string | null
	/**
	 * Enregistrement perso montré (type `recording`). Sa note n'en fait pas partie : elle
	 * reste à son auteur, c'est le message de la publication qui s'adresse au groupe.
	 */
	recording_title: string | null
	recording_has_audio: boolean
	recording_duration_s: number | null
}

/**
 * La publication a-t-elle un lecteur ? C'est aussi ce qui permet d'y ancrer un
 * commentaire. La vidéo d'une suggestion n'en est pas un : c'est une citation, montrée
 * en vignette comme un lien dans un commentaire, sans position à suivre.
 */
export function postPlayable(
	post: Pick<PostView, 'type' | 'youtube_video_id' | 'recording_has_audio'>
): boolean {
	if (post.type === 'song_suggestion') return false
	return post.recording_has_audio || post.youtube_video_id !== null
}

/**
 * Ce que le groupe voit : une vidéo de l'espace perso, sans piste audio, se publie
 * « depuis l'espace » mais reste une vidéo pour qui la reçoit.
 */
export function postKindLabel(post: Pick<PostView, 'type' | 'recording_has_audio' | 'youtube_video_id'>): string {
	if (post.type === 'recording' && !post.recording_has_audio && post.youtube_video_id) {
		return POST_TYPE_LABELS.youtube
	}
	return POST_TYPE_LABELS[post.type]
}

/** Titre d'une publication, pour une notification, un fil d'actualité ou un onglet. */
export function postTitle(post: Pick<PostView, 'type' | 'recording_title' | 'youtube_title' | 'song_title'>): string {
	switch (post.type) {
		case 'recording': return post.recording_title ?? 'Enregistrement'
		case 'youtube': return post.youtube_title ?? 'Vidéo YouTube'
		case 'song_suggestion': return post.song_title ?? 'Suggestion de morceau'
	}
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

// ─── Fil d'actualité (/fil) ───────────────────────────────────────────────

/** Une prise dans une carte « prises ajoutées » du fil. */
export type FeedRecording = {
	id: number
	song_id: number
	song_title: string
	take: number
	duration_s: number | null
	has_audio: boolean
	has_video: boolean
	comment_count: number
}

type FeedBase = {
	/** Clé stable de l'élément, et départage du curseur à horodatage égal. */
	key: string
	/** Horodatage ISO, pour l'affichage — le curseur, lui, garde la précision de Postgres. */
	at: string
	author: string
}

export type FeedItem =
	| (FeedBase & {
			kind: 'post'
			post: PostView
			reactions: ReactionSummary
			comments: CommentWithReactions[]
	  })
	| (FeedBase & {
			kind: 'session'
			session: {
				id: number
				date: string
				type: string
				title: string | null
				location: string | null
				song_titles: string[]
				recording_count: number
			}
	  })
	| (FeedBase & {
			kind: 'recordings'
			session: { id: number; date: string; type: string; title: string | null }
			recordings: FeedRecording[]
	  })
	| (FeedBase & {
			kind: 'setlist'
			setlist: {
				id: number
				name: string
				description: string | null
				song_count: number
				total_duration_s: number
				missing_duration_count: number
				song_titles: string[]
			}
			comments: CommentWithReactions[]
	  })
	| (FeedBase & {
			kind: 'playlist'
			playlist: { id: number; name: string; description: string | null; item_count: number }
	  })

export type FeedPage = {
	items: FeedItem[]
	/** Curseur de la page suivante, `null` en fin de fil. */
	next: string | null
}
