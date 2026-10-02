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

	const today = localDateOnly(date) === localDateOnly()

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

/**
 * Jour civil d'un instant dans le fuseau de l'appareil (« 2026-10-02 ») : c'est le jour
 * vécu par qui enregistre, là où `toISOString` donnerait celui de Greenwich.
 */
export function localDateOnly(date: Date = new Date()) {
	const pad = (n: number) => String(n).padStart(2, '0')
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * Jour civil d'une valeur : une date seule (« 2026-10-02 », colonne DATE) telle quelle, un
 * instant (horodatage de création) ramené au fuseau de l'appareil. `toDateOnly` lirait ce
 * dernier à Greenwich, et une prise déposée à 23 h passerait au lendemain.
 */
function calendarDay(value: DateValue) {
	if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return value.trim()
	const date = toDate(value)
	return date ? localDateOnly(date) : ''
}

/**
 * Nombre de jours civils entre aujourd'hui et `value` (négatif dans le passé), date seule
 * ou horodatage.
 */
export function daysFromToday(value: DateValue, today = localDateOnly()) {
	return Math.round(
		(Date.parse(`${calendarDay(value)}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000
	)
}

/**
 * « Aujourd'hui », « Demain » ou « Hier », sinon null : pour ces trois jours, le mot dit
 * d'emblée ce qu'un quantième obligerait à calculer. À l'appelant de choisir le repli.
 */
export function nearDayLabel(value: DateValue, today = localDateOnly()) {
	const days = daysFromToday(value, today)
	return days === 0 ? "Aujourd'hui" : days === 1 ? 'Demain' : days === -1 ? 'Hier' : null
}

/**
 * Écart d'un jour civil à aujourd'hui, en mots : « Aujourd'hui », « Demain », « Dans 5 jours »,
 * « Hier », « Il y a 3 semaines ». Pour une date proche, ce qui compte est le temps qui
 * sépare d'elle, pas son quantième.
 */
export function relativeDayLabel(value: DateValue, today = localDateOnly()) {
	const days = daysFromToday(value, today)
	const near = nearDayLabel(value, today)
	if (near) return near
	const n = Math.abs(days)
	const span = n < 14 ? `${n} jours` : n < 60 ? `${Math.round(n / 7)} semaines` : `${Math.round(n / 30)} mois`
	return days > 0 ? `Dans ${span}` : `Il y a ${span}`
}

/**
 * La session tenue le jour où un son a été capté : c'est elle qu'on propose pour le
 * classer. Le jour de l'enregistrement, pas celui du classement — on valide souvent
 * le lendemain, ou après minuit.
 */
export function sessionOfDay<T extends { date: DateValue }>(sessions: T[], recordedAt: Date) {
	const day = localDateOnly(recordedAt)
	return sessions.find((s) => toDateOnly(s.date) === day)
}
