// Préférences de notification d'un membre dans un groupe (`user_groups.notification_prefs`).
// Partagé entre l'écran (formulaire, résumé) et le serveur (validation, filtre du fan-out).

/**
 * Commentaires : le seul type où un interrupteur ne suffit pas. Tout le groupe commente
 * tout, et c'est de loin ce qui fait le plus de bruit ; « ce qui me concerne » garde les
 * discussions où l'on a quelque chose à répondre.
 */
export type CommentLevel = 'all' | 'involved' | 'none'

export const COMMENT_LEVELS: { value: CommentLevel; label: string; hint: string }[] = [
	{ value: 'all', label: 'Tous', hint: 'Chaque commentaire du groupe.' },
	{
		value: 'involved',
		label: 'Ce qui me concerne',
		hint: 'Sur ce que vous avez déposé ou créé, et dans les discussions où vous avez écrit.'
	},
	{ value: 'none', label: 'Aucun', hint: 'Vous les lirez dans le fil.' }
]

/** Les autres types, chacun par un interrupteur. Les mentions n'y sont pas : elles parviennent toujours. */
export const TOGGLE_TYPES = ['recording', 'session', 'playlist', 'setlist', 'post', 'agenda'] as const
export type ToggleType = (typeof TOGGLE_TYPES)[number]

export const TOGGLE_LABELS: Record<ToggleType, string> = {
	recording: 'Nouvelles prises',
	session: 'Nouvelles sessions',
	playlist: 'Nouvelles playlists',
	setlist: 'Nouvelles setlists',
	post: 'Publications',
	agenda: "Dates et indisponibilités de l'agenda"
}

export type NotificationPrefs = { comment: CommentLevel } & Record<ToggleType, boolean>

/** Tout, comme avant l'existence des préférences. */
export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
	comment: 'all',
	recording: true,
	session: true,
	playlist: true,
	setlist: true,
	post: true,
	agenda: true
}

function isCommentLevel(value: unknown): value is CommentLevel {
	return value === 'all' || value === 'involved' || value === 'none'
}

/** Ce qui est en base, complété par les valeurs par défaut : une clé absente vaut « tout ». */
export function readNotificationPrefs(raw: unknown): NotificationPrefs {
	const stored = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
	const prefs = { ...DEFAULT_NOTIFICATION_PREFS }
	if (isCommentLevel(stored.comment)) prefs.comment = stored.comment
	for (const type of TOGGLE_TYPES) {
		if (typeof stored[type] === 'boolean') prefs[type] = stored[type] as boolean
	}
	return prefs
}

/**
 * Lecture d'un formulaire : `comment` (niveau) et une case par type. Une case absente du
 * formulaire est décochée — c'est ainsi qu'un navigateur envoie une case vide. `null`
 * sur un niveau inconnu.
 */
export function parseNotificationPrefsForm(data: FormData): NotificationPrefs | null {
	const comment = data.get('comment')
	if (!isCommentLevel(comment)) return null
	const prefs = { ...DEFAULT_NOTIFICATION_PREFS, comment }
	for (const type of TOGGLE_TYPES) prefs[type] = data.get(type) === 'on'
	return prefs
}

/** Une ligne pour le profil : « Toutes », ou ce qui s'écarte du défaut. */
export function summarizeNotificationPrefs(prefs: NotificationPrefs): string {
	const off = TOGGLE_TYPES.filter((type) => !prefs[type])
	if (prefs.comment === 'all' && off.length === 0) return 'Toutes'
	if (prefs.comment === 'none' && off.length === TOGGLE_TYPES.length) return 'Mentions seulement'

	const parts: string[] = []
	if (prefs.comment !== 'all') {
		parts.push(prefs.comment === 'none' ? 'aucun commentaire' : 'commentaires qui me concernent')
	}
	if (off.length === TOGGLE_TYPES.length) parts.push('rien d’autre')
	else if (off.length) parts.push(`sans ${off.map((type) => TOGGLE_LABELS[type].toLowerCase()).join(', ')}`)
	const text = parts.join(' · ')
	return text.charAt(0).toUpperCase() + text.slice(1)
}
