/**
 * Amélioration du son d'une prise : ce que l'écran et le serveur partagent — les mesures,
 * le diagnostic qui décide de proposer l'amélioration, et le réglage de la chaîne.
 *
 * La chaîne, dans l'ordre : gain d'entrée → coupe-bas léger → égalisation →
 * compression douce → normalisation loudness → limiteur. Rien n'y décale le temps (filtres
 * IIR, compresseur sans anticipation, limiteur au retard compensé) : un commentaire ancré
 * à 1:23 reste sur la même note après amélioration. Les filtres ffmpeg eux-mêmes sont
 * écrits côté serveur (`src/lib/server/audio-enhance.ts`).
 *
 * Trois réglages suivent la mesure : le gain d'entrée, le taux de compression et le dosage
 * de l'égalisation. Ce dernier est calibré à l'oreille sur des prises réelles — voir
 * `TILT_FULL_DB` —, pas déduit a priori d'un spectre de référence.
 */

/** Mesures EBU R128 d'un fichier, prises sur l'original. */
export type AudioAnalysis = {
	/** Loudness intégrée, en LUFS. */
	integrated_lufs: number
	/** Plage de loudness (LRA), en LU : l'écart entre passages calmes et passages forts. */
	lra_lu: number
	/** Crête vraie, en dBTP. `null` pour un fichier muet (crête à −∞). */
	true_peak_dbtp: number | null
	/**
	 * Équilibre aigu / grave : énergie de la présence (2–6 kHz) moins celle du bas-médium
	 * (150–500 Hz), en dB. Très négatif = son étouffé, le grave de la salle domine.
	 * `null` pour une mesure antérieure à ce champ, ou un fichier muet.
	 */
	tilt_db: number | null
	/**
	 * Aigus au-dessus de 6 kHz moins le bas-médium, en dB : ce qui distingue un son
	 * vraiment étouffé d'un mix aux cymbales brillantes dont la présence seule est creuse.
	 * `null` comme `tilt_db`.
	 */
	air_db: number | null
	/**
	 * Grave (40–150 Hz) moins le bas-médium, en dB : un grave qui couvre le reste.
	 * `null` comme `tilt_db`.
	 */
	bass_db: number | null
	/** Taille du fichier mesuré : une autre taille, et la mesure est à refaire. */
	source_bytes: number
}

/**
 * Loudness visée : celle de YouTube et Spotify. −16 (Apple Music) paraissait trop faible
 * à l'écoute, et baissait un morceau déjà masterisé de 6 dB. À −14, le limiteur ne retire
 * que 0,6 dB au plus sur les prises de calibrage ; à −12, il écrasait déjà les attaques
 * du piano (2,6 dB). Un morceau masterisé plus fort reste ramené ici : le garder à son
 * niveau après compression demanderait 3,5 dB de limiteur.
 */
export const ENHANCE_TARGET_LUFS = -14
/** Plafond du limiteur, en dBFS : la marge que l'encodage mp3 consomme en crêtes. */
export const ENHANCE_LIMIT_DB = -1.5
/**
 * Sous ce niveau, il n'y a pas de musique à remonter, seulement du bruit de fond : les
 * 34 dB de gain nécessaires en feraient un souffle. Un fichier muet mesure −70.
 */
export const ENHANCE_SILENT_BELOW_LUFS = -50

/**
 * Dosage de l'égalisation, selon l'équilibre aigu / grave (`tilt_db`, `air_db`).
 *
 * Calibré sur deux prises de répétition piano acoustique et voix, dans un même local,
 * l'une au téléphone, l'autre au micro à condensateur, qui mesuraient −14,4 et −13,5 dB :
 * la même signature avec deux appareils que tout oppose, c'est la salle qui l'imprime,
 * pas le micro. Sur l'une comme sur l'autre, entre plusieurs dosages écoutés au même
 * volume, c'est `EQ_FULL` qui sonnait juste — le double devenait criard.
 *
 * Au-dessus de `TILT_OK_DB`, l'équilibre est bon et rien n'est touché ; le dosage croît
 * ensuite jusqu'à `EQ_FULL`, atteint à `TILT_FULL_DB`, et ne va pas au-delà : plus sombre
 * encore, monter davantage les aigus remonterait surtout le souffle.
 *
 * La présence seule ne suffit pas : un morceau de groupe déjà masterisé mesurait −12,4 dB,
 * comme une prise étouffée, et l'égalisation l'abîmait à l'écoute — ses aigus au-dessus
 * de 6 kHz (cymbales) étaient bien là. D'où la seconde condition, `AIR_MUFFLED_DB` :
 * −25 et −26,9 dB pour les prises piano–voix, −16,7 pour le groupe ; le seuil passe au
 * milieu. Une prise qui ne manque pas d'aigus n'est pas égalisée du tout.
 *
 * Le grave a sa propre mesure et sa propre correction, indépendantes de ce dosage :
 * voir `BASS_HEAVY_DB`. Un son trop brillant n'est pas corrigé : aucune prise réelle pour
 * le calibrer. Une seule salle et deux formations pour l'instant : d'autres pourront
 * déplacer les seuils.
 */
const TILT_OK_DB = -10
const TILT_FULL_DB = -13
/** En deçà, la correction serait trop faible pour s'entendre : pas de quoi la proposer. */
const TILT_MUFFLED_DB = -11
/** Au-dessus, les aigus sont là : le son n'est pas étouffé, quelle que soit la présence. */
const AIR_MUFFLED_DB = -21

type EqBand = { type: 'peak' | 'highshelf' | 'lowshelf'; freq_hz: number; q: number; gain_db: number }

/**
 * Grave trop présent. Calibré sur un morceau de groupe masterisé (grave −2,2 dB face au
 * bas-médium, contre −9,2 et −7,2 pour les prises piano–voix) : entre −1,5 et −2,5 dB
 * sous 100 Hz, écoutés au même volume, −2,5 sonnait le mieux. Une coupe plus franche,
 * placée avant le compresseur, l'avait trop atténué. Le seuil passe au milieu.
 *
 * La coupe se fait **après** le compresseur : avant, elle le faisait moins travailler,
 * et il rendait au grave une partie de ce qu'on lui retirait.
 */
const BASS_HEAVY_DB = -4.5
const BASS_CUT: EqBand = { type: 'lowshelf', freq_hz: 100, q: 0.7, gain_db: -2.5 }
/**
 * Grave renforcé : le corps du grave (main gauche du piano, basse, grosse caisse), que le
 * creusement du bas-médium allègerait sinon. Il faisait partie de l'égalisation franche
 * lors du calibrage, et c'est lui — avec le carton creusé — qui faisait « mieux entendre
 * les basses du piano » face à l'éclaircissement seul. Avant le compresseur, à sa place
 * d'origine, pour que les prises calibrées sonnent à l'identique.
 */
const BASS_BOOST: EqBand = { type: 'peak', freq_hz: 90, q: 0.9, gain_db: 2 }

const EQ_FULL: EqBand[] = [
	// Le carton de la salle, où s'entasse l'énergie d'une prise étouffée.
	{ type: 'peak', freq_hz: 280, q: 0.8, gain_db: -4 },
	// La présence : intelligibilité de la voix, attaque des marteaux, guitares.
	{ type: 'peak', freq_hz: 3000, q: 0.9, gain_db: 3 },
	// L'air : souffle de la voix, harmoniques aiguës du piano, cymbales.
	{ type: 'highshelf', freq_hz: 7000, q: 0.5, gain_db: 3 }
]

function heavyBass(a: Pick<AudioAnalysis, 'bass_db'>): boolean {
	return a.bass_db !== null && a.bass_db > BASS_HEAVY_DB
}

/** Un son étouffé manque à la fois de présence et d'aigus. */
function lacksHighs(a: Pick<AudioAnalysis, 'air_db'>): boolean {
	return a.air_db !== null && a.air_db < AIR_MUFFLED_DB
}

/** Part de `EQ_FULL` à appliquer, de 0 (rien à corriger) à 1. */
export function eqAmount(a: Pick<AudioAnalysis, 'tilt_db' | 'air_db'>): number {
	if (a.tilt_db === null || !lacksHighs(a)) return 0
	return clamp((TILT_OK_DB - a.tilt_db) / (TILT_OK_DB - TILT_FULL_DB), 0, 1)
}

/**
 * Réglages d'une amélioration, choisis prise par prise : le module propose les siens
 * (`proposedSettings`), et l'oreille a le dernier mot. Les seuils ne décident que de la
 * proposition — une prise qui les déjoue se corrige ici, sans toucher aux autres.
 */
export type EqLevel = 'none' | 'soft' | 'full'
export type BassChoice = 'cut' | 'none' | 'boost'
export type EnhanceSettings = { eq: EqLevel; bass: BassChoice; compression: boolean }

export const EQ_LEVELS: EqLevel[] = ['none', 'soft', 'full']
export const EQ_LEVEL_LABELS: Record<EqLevel, string> = { none: 'Aucune', soft: 'Douce', full: 'Franche' }
export const BASS_CHOICES: BassChoice[] = ['cut', 'none', 'boost']
export const BASS_CHOICE_LABELS: Record<BassChoice, string> = { cut: 'Allégé', none: 'Tel quel', boost: 'Renforcé' }
/** « Douce » vaut la moitié de « Franche » : le dosage entre les deux variantes écoutées. */
const EQ_LEVEL_AMOUNT: Record<EqLevel, number> = { none: 0, soft: 0.5, full: 1 }

/** Ce que le module propose : le dosage mesuré, ramené au palier le plus proche. */
export function proposedSettings(a: AudioAnalysis): EnhanceSettings {
	const amount = eqAmount(a)
	// La compression a servi sur toutes les prises écoutées, master compris.
	return {
		eq: amount === 0 ? 'none' : amount < 0.75 ? 'soft' : 'full',
		// Faute de prise au grave maigre qui ne soit pas étouffée, le renfort accompagne la
		// proposition d'égalisation, comme au calibrage — sauf grave déjà trop présent.
		bass: heavyBass(a) ? 'cut' : amount > 0 ? 'boost' : 'none',
		compression: true
	}
}

/** Réglages reçus du navigateur, ou relus d'un fichier : `null` s'ils sont mal formés. */
export function parseEnhanceSettings(raw: unknown): EnhanceSettings | null {
	if (typeof raw !== 'object' || raw === null) return null
	const { eq, bass, compression } = raw as Record<string, unknown>
	if (!EQ_LEVELS.includes(eq as EqLevel) || typeof compression !== 'boolean') return null
	if (bass === undefined) {
		// Réglages gardés avant le choix du grave : le renfort faisait partie de l'égalisation.
		return { eq: eq as EqLevel, bass: eq === 'none' ? 'none' : 'boost', compression }
	}
	if (!BASS_CHOICES.includes(bass as BassChoice)) return null
	return { eq: eq as EqLevel, bass: bass as BassChoice, compression }
}

export function sameSettings(a: EnhanceSettings | null, b: EnhanceSettings | null): boolean {
	return !!a && !!b && a.eq === b.eq && a.bass === b.bass && a.compression === b.compression
}

/**
 * Les réglages en un mot (`full-boost-comp`) : le nom de leur aperçu sur disque, et ce que
 * l'écran demande à écouter. Chaque réglage essayé garde le sien — y revenir ne coûte rien.
 */
export function settingsKey(s: EnhanceSettings): string {
	return `${s.eq}-${s.bass}-${s.compression ? 'comp' : 'flat'}`
}

export function parseSettingsKey(key: string | null): EnhanceSettings | null {
	const [eq, bass, compression, ...rest] = (key ?? '').split('-')
	if (rest.length > 0 || (compression !== 'comp' && compression !== 'flat')) return null
	return parseEnhanceSettings({ eq, bass: bass ?? null, compression: compression === 'comp' })
}

/** Niveau de travail du compresseur : son seuil n'a de sens que pour un niveau connu. */
const WORKING_LUFS = -20
const MAX_PRE_GAIN_DB = 24
const MAX_CUT_DB = -20

export type EnhanceIssue = {
	kind: 'quiet' | 'loud' | 'dynamics' | 'muffled' | 'boomy' | 'saturated'
	label: string
	/** Faux pour un défaut signalé que l'amélioration ne corrige pas (saturation). */
	fixable: boolean
}

export type EnhanceDiagnosis = {
	issues: EnhanceIssue[]
	/** Au moins un défaut que la chaîne corrige : l'amélioration est alors proposée. */
	recommended: boolean
	/** Faux pour un fichier quasi muet : rien à améliorer. */
	enhanceable: boolean
}

/**
 * Ce que l'écran dit d'un son, et s'il propose de l'améliorer. Les seuils sont larges à
 * dessein : on ne propose de retoucher que ce qui s'entend, pas un écart de 2 dB.
 */
export function diagnose(a: AudioAnalysis): EnhanceDiagnosis {
	const enhanceable = a.integrated_lufs > ENHANCE_SILENT_BELOW_LUFS
	const issues: EnhanceIssue[] = []

	if (!enhanceable) {
		return { issues, recommended: false, enhanceable }
	}
	if (a.integrated_lufs < ENHANCE_TARGET_LUFS - 6) {
		issues.push({ kind: 'quiet', label: 'Son faible : il faut monter le volume pour l’entendre', fixable: true })
	} else if (a.integrated_lufs > ENHANCE_TARGET_LUFS + 4) {
		issues.push({ kind: 'loud', label: 'Son très fort, plus que les autres prises', fixable: true })
	}
	if (a.tilt_db !== null && a.tilt_db < TILT_MUFFLED_DB && lacksHighs(a)) {
		issues.push({ kind: 'muffled', label: 'Son étouffé : le grave de la salle domine, les aigus manquent', fixable: true })
	}
	if (heavyBass(a)) {
		issues.push({ kind: 'boomy', label: 'Grave très présent : il couvre le reste', fixable: true })
	}
	if (a.lra_lu > 14) {
		issues.push({ kind: 'dynamics', label: 'Grands écarts de volume entre passages calmes et forts', fixable: true })
	}
	// Une crête au plafond ne dit pas d'où elle vient : saturation à la captation, ou
	// limiteur d'un son déjà masterisé — une prise de groupe masterisée l'atteint sans
	// rien écrêter. L'écran dit ce qui est mesuré, pas la cause. Le limiteur final évite
	// d'en rajouter, mais rien ne rend ce qui aurait été écrêté à la captation.
	if (a.true_peak_dbtp !== null && a.true_peak_dbtp > -0.1) {
		issues.push({
			kind: 'saturated',
			label: 'Crêtes au niveau maximal : saturation à l’enregistrement, ou son déjà masterisé',
			fixable: false
		})
	}

	return { issues, recommended: issues.some((i) => i.fixable), enhanceable }
}

export type EnhancePlan = {
	/** Gain d'entrée, qui amène le son au niveau de travail du compresseur. */
	pre_gain_db: number
	highpass_hz: number
	/** Vide sans égalisation. */
	eq: EqBand[]
	/** `null` sans compression. */
	compressor: { threshold_db: number; ratio: number; attack_ms: number; release_ms: number } | null
	/** Renfort du grave, avant l'égalisation ; `null` sans. */
	bass_boost: EqBand | null
	/** Coupe du grave, après le compresseur ; `null` sans. */
	bass_cut: EqBand | null
	target_lufs: number
	limit_db: number
}

export function enhancePlan(a: AudioAnalysis, settings: EnhanceSettings = proposedSettings(a)): EnhancePlan {
	return {
		pre_gain_db: round1(clamp(WORKING_LUFS - a.integrated_lufs, MAX_CUT_DB, MAX_PRE_GAIN_DB)),
		// Le grondement (manipulation, ventilation, trafic) vit sous 35 Hz. Plus haut, la
		// coupe mordrait sur le mi grave d'une basse (41 Hz) : « léger » est ici une contrainte.
		// Les toutes premières notes d'un piano (la 0, 27,5 Hz) y perdent leur fondamentale,
		// qu'une prise de salle ne capte guère : l'oreille les entend par leurs harmoniques.
		highpass_hz: 35,
		eq: eqBands(settings.eq),
		compressor: settings.compression ? {
			// Quelques dB sous le niveau de travail : seuls les passages forts sont tenus.
			threshold_db: WORKING_LUFS - 4,
			// Un son déjà tenu n'a pas à l'être davantage ; un son aux grands écarts, un peu plus.
			ratio: a.lra_lu <= 8 ? 1.5 : a.lra_lu <= 14 ? 2 : 2.5,
			attack_ms: 15,
			release_ms: 200
		} : null,
		bass_boost: settings.bass === 'boost' ? BASS_BOOST : null,
		bass_cut: settings.bass === 'cut' ? BASS_CUT : null,
		target_lufs: ENHANCE_TARGET_LUFS,
		limit_db: ENHANCE_LIMIT_DB
	}
}

/** Ce que `GET /api/recordings/[id]/enhance` rend à l'écran. */
export type EnhanceState = {
	/** `null` si le fichier n'a pas pu être mesuré. */
	analysis: AudioAnalysis | null
	diagnosis: EnhanceDiagnosis | null
	/** Les réglages que le module propose pour cette prise. */
	proposed: EnhanceSettings | null
	/**
	 * Renseigné quand le fichier servi est la version améliorée, avec les réglages qui
	 * l'ont produite (`null` s'ils n'ont pas été gardés).
	 */
	enhanced: { at: string; by: string | null; settings: EnhanceSettings | null } | null
	/**
	 * Réglages des aperçus déjà rendus pour l'original actuel, le plus récent d'abord :
	 * chacun s'écoute et se garde sans nouveau rendu. Vide pour une prise déjà améliorée.
	 */
	previews: EnhanceSettings[]
	/**
	 * Les autres prises de la même session : même salle, même micro, donc souvent les mêmes
	 * réglages. `last` est la dernière améliorée, dont l'écran reprend les réglages.
	 */
	session: {
		others: SessionTake[]
		last: (SessionTake & { settings: EnhanceSettings }) | null
	}
}

/** Une prise de la session, telle que l'écran d'amélioration la cite. */
export type SessionTake = { id: number; take: number; song_title: string; enhanced: boolean }

/** Les deux versions comparées à l'écran, quel que soit l'état de la prise. */
export type EnhanceVersion = 'original' | 'enhanced'

function eqBands(level: EqLevel): EqBand[] {
	const amount = EQ_LEVEL_AMOUNT[level]
	if (amount === 0) return []
	return EQ_FULL.map((band) => ({ ...band, gain_db: round1(band.gain_db * amount) }))
}

/** Une grandeur sans signe — une plage, pas un gain : « 14,1 LU ». */
export function formatLevel(value: number, unit: string): string {
	return `${(Math.round(value * 10) / 10).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} ${unit}`
}

/** « −29 LUFS », à la française. */
export function formatDb(value: number, unit: string): string {
	const rounded = Math.round(value * 10) / 10
	const text = Math.abs(rounded).toLocaleString('fr-FR', { maximumFractionDigits: 1 })
	return `${rounded < 0 ? '−' : rounded > 0 ? '+' : ''}${text} ${unit}`
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value))
}

function round1(value: number): number {
	return Math.round(value * 10) / 10
}
