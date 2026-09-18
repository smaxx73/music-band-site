export type DateValue = string | Date | null | undefined

function isValidDate(value: Date) {
	return Number.isFinite(value.getTime())
}

export function toDateOnly(value: DateValue) {
	if (!value) return ''

	if (value instanceof Date) {
		return isValidDate(value) ? value.toISOString().slice(0, 10) : ''
	}

	const trimmed = value.trim()
	if (!trimmed) return ''

	if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
		return trimmed
	}

	const datePrefix = trimmed.match(/^(\d{4}-\d{2}-\d{2})[T\s]/)?.[1]
	if (datePrefix) {
		return datePrefix
	}

	const parsed = new Date(trimmed)
	return isValidDate(parsed) ? parsed.toISOString().slice(0, 10) : ''
}

export function formatDateOnly(
	value: DateValue,
	options: Intl.DateTimeFormatOptions,
	locale = 'fr-FR'
) {
	const dateOnly = toDateOnly(value)
	if (!dateOnly) return 'Date invalide'

	return new Date(`${dateOnly}T00:00:00`).toLocaleDateString(locale, options)
}

function toDate(value: DateValue) {
	if (!value) return null
	const date = value instanceof Date ? value : new Date(value)
	return isValidDate(date) ? date : null
}

/** « 17 sept. », et « 17 sept. 2025 » hors de l'année en cours. */
function dateLabel(date: Date, locale: string) {
	const sameYear = date.getFullYear() === new Date().getFullYear()
	return date.toLocaleDateString(locale, {
		day: 'numeric',
		month: 'short',
		...(sameYear ? {} : { year: 'numeric' })
	})
}

function timeLabel(date: Date, locale: string) {
	return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
}

/**
 * Horodatage d'un contenu : « 17 sept., 12:35 », ou l'heure seule quand c'est
 * aujourd'hui — à la date du jour, la date n'apprend rien, l'heure si.
 */
export function formatDateTime(value: DateValue, locale = 'fr-FR') {
	const date = toDate(value)
	if (!date) return 'Date invalide'

	const now = new Date()
	const today =
		date.getFullYear() === now.getFullYear() &&
		date.getMonth() === now.getMonth() &&
		date.getDate() === now.getDate()

	return today ? timeLabel(date, locale) : `${dateLabel(date, locale)}, ${timeLabel(date, locale)}`
}

/**
 * Toujours daté, même aujourd'hui : pour les infobulles, où « Modifié le 12:35 »
 * ne voudrait rien dire.
 */
export function formatDateTimeFull(value: DateValue, locale = 'fr-FR') {
	const date = toDate(value)
	if (!date) return 'Date invalide'

	return `${dateLabel(date, locale)}, ${timeLabel(date, locale)}`
}
