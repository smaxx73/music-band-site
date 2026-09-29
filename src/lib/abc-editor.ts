/** Déplace une note ABC d'un degré sur la portée, en gardant sa durée. */
export function moveAbcPitch(token: string, direction: -1 | 1): string | null {
	const match = token.match(/^(\^\^|__|[\^_=])?([A-Ga-g])([,']*)(\d+\/\d+|\d+|\/\d+|\/+)?$/)
	if (!match) return null

	const letter = match[2]
	const degree = 'CDEFGAB'.indexOf(letter.toUpperCase())
	let octave = letter === letter.toLowerCase() ? 1 : 0
	for (const mark of match[3]) octave += mark === "'" ? 1 : -1

	const position = octave * 7 + degree + direction
	const nextOctave = Math.floor(position / 7)
	const nextDegree = ((position % 7) + 7) % 7
	const nextLetter = 'CDEFGAB'[nextDegree]
	const pitch = nextOctave >= 1
		? nextLetter.toLowerCase() + "'".repeat(nextOctave - 1)
		: nextLetter + ','.repeat(-nextOctave)
	return (match[1] ?? '') + pitch + (match[4] ?? '')
}
