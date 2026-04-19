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
