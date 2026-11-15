/**
 * Amélioration du son d'une prise : ce que l'écran et le serveur partagent — les mesures,
 * le diagnostic qui décide de proposer l'amélioration, et le réglage de la chaîne.
 *
 * La chaîne, dans l'ordre : débruitage (mode expert seulement) → gain d'entrée →
 * coupe-bas léger → égalisation → compression douce → normalisation loudness → limiteur.
 * Rien n'y décale le temps (filtres IIR, compresseur sans anticipation, limiteur et
 * débruiteur au retard compensé) : un commentaire ancré à 1:23 reste sur la même note
 * après amélioration. Les filtres ffmpeg eux-mêmes sont écrits côté serveur
 * (`src/lib/server/audio-enhance.ts`).
 *
 * Deux niveaux de réglage : trois choix par paliers, que le module propose et que tout le
 * monde règle, et un **mode expert** (`ExpertSettings`) qui rend chaque valeur de la
 * chaîne réglable à la main — voir `EXPERT_PARAMS`.
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
	/**
	 * Spectre, bruit de fond et répartition des niveaux : ce que le mode expert dessine et
	 * ce dont le débruitage tire son seuil. Mesuré à la demande, à la première ouverture du
	 * mode expert — absent tant que personne ne l'a ouvert sur cette prise.
	 */
	profile?: AudioProfile
}

/**
 * Profil d'un fichier (`src/lib/server/audio-profile.ts`). Les niveaux sont des dBFS RMS,
 * sur l'échelle du fichier mesuré : la somme des bandes redonne le niveau du signal.
 */
export type AudioProfile = {
	/** Centre de chaque bande d'un tiers d'octave, en Hz, de 20 Hz à 20 kHz. */
	freqs_hz: number[]
	/** Niveau moyen de chaque bande sur tout le fichier. */
	mean_db: number[]
	/**
	 * Niveau de chaque bande dans ses moments les plus calmes (10ᵉ centile) : le bruit de
	 * fond, si le morceau a des respirations — sinon, la musique la plus douce.
	 */
	noise_db: number[]
	/** Niveau d'ensemble des passages les plus calmes (5ᵉ centile). */
	quiet_db: number
	/** Niveau d'ensemble des passages forts (95ᵉ centile). */
	loud_db: number
	/** Part du temps passée à chaque niveau, par pas de 1 dB à partir de `levels_from_db`. */
	levels: number[]
	levels_from_db: number
}

/**
 * Le bruit de fond ne se mesure que s'il y a des blancs : il faut que les passages calmes
 * soient nettement sous les passages forts. Un groupe qui joue sans pause ne descend que
 * de 5 à 15 dB, et ses passages calmes sont encore de la musique ; un enregistrement au
 * téléphone avec des respirations, d'une trentaine.
 */
const NOISE_MEASURABLE_GAP_DB = 25

export function noiseMeasurable(p: AudioProfile): boolean {
	return p.loud_db - p.quiet_db >= NOISE_MEASURABLE_GAP_DB
}

/** Seuil du débruiteur faute de profil : celui des variantes écoutées au calibrage. */
const DENOISE_FLOOR_FALLBACK_DB = -50

/**
 * Seuil proposé au débruiteur : 5 dB au-dessus du bruit mesuré — en deçà, la réduction
 * demandée n'est pas atteinte (mesuré sur un bruit blanc : 10 dB obtenus pour 12 demandés
 * avec le seuil au niveau du bruit, 12 avec 5 dB de marge). Jamais à moins de 30 dB sous
 * les passages forts : sur une prise sans blanc, les « passages calmes » sont de la
 * musique, et un seuil posé sur eux la rongerait.
 */
export function autoDenoiseFloor(p: AudioProfile | undefined): number {
	if (!p) return DENOISE_FLOOR_FALLBACK_DB
	return clamp(Math.round(Math.min(p.quiet_db + 5, p.loud_db - 30)), -80, -20)
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

export type EqBand = { type: 'peak' | 'highshelf' | 'lowshelf'; freq_hz: number; q: number; gain_db: number }

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
export type EnhanceSettings = { eq: EqLevel; bass: BassChoice; compression: boolean; expert?: ExpertSettings }

/**
 * Mode expert : chaque valeur de la chaîne, réglable à la main. Un réglage absent garde
 * la valeur que les trois choix par paliers (et la mesure) lui donnent — seuls les écarts
 * sont gardés, pour que des réglages repris sur une autre prise de la session continuent
 * de suivre sa mesure là où l'on n'a rien touché.
 *
 * Rien ici n'est proposé par le module ni calibré à l'oreille : les paliers le sont, le
 * mode expert sert justement aux prises qui les déjouent.
 */
export type ExpertParam =
	| 'denoise_db' | 'denoise_floor_db'
	| 'highpass_hz' | 'mud_db' | 'presence_db' | 'air_db' | 'bass_db'
	| 'ratio' | 'threshold_db' | 'attack_ms' | 'release_ms'
	| 'target_lufs' | 'limit_db'

export type ExpertSettings = Partial<Record<ExpertParam, number>> & {
	/** Le débruiteur réévalue le bruit au fil du morceau, à partir de son seuil. */
	denoise_track?: true
}

/**
 * Bornes et pas de chaque réglage expert, et son code dans la clé d'un aperçu
 * (`settingsKey`). Les bornes sont celles au-delà desquelles le réglage n'a plus de sens
 * pour une prise de répétition, pas celles du filtre.
 */
export const EXPERT_PARAMS: Record<ExpertParam, { code: string; min: number; max: number; step: number }> = {
	// Réduction du bruit de fond, en dB ; 0 = pas de débruitage.
	denoise_db: { code: 'dn', min: 0, max: 24, step: 1 },
	// Niveau sous lequel le débruiteur tient un son pour du bruit (défaut : `autoDenoiseFloor`).
	denoise_floor_db: { code: 'df', min: -80, max: -20, step: 1 },
	// 0 = pas de coupe-bas.
	highpass_hz: { code: 'hp', min: 0, max: 150, step: 5 },
	// Les trois bandes de l'égalisation : carton (280 Hz), présence (3 kHz), air (7 kHz).
	mud_db: { code: 'mu', min: -9, max: 6, step: 0.5 },
	presence_db: { code: 'pr', min: -6, max: 6, step: 0.5 },
	air_db: { code: 'ai', min: -6, max: 6, step: 0.5 },
	// Négatif : grave allégé sous 100 Hz, après le compresseur. Positif : renforcé à 90 Hz, avant.
	bass_db: { code: 'ba', min: -6, max: 6, step: 0.5 },
	ratio: { code: 'ra', min: 1.2, max: 6, step: 0.1 },
	// Seuil du compresseur, pour un son amené à −20 LUFS par le gain d'entrée.
	threshold_db: { code: 'th', min: -40, max: -10, step: 1 },
	attack_ms: { code: 'at', min: 1, max: 100, step: 1 },
	release_ms: { code: 're', min: 50, max: 1000, step: 10 },
	target_lufs: { code: 'tl', min: -20, max: -10, step: 0.5 },
	limit_db: { code: 'li', min: -3, max: -0.3, step: 0.1 }
}

export const EXPERT_PARAM_NAMES = Object.keys(EXPERT_PARAMS) as ExpertParam[]
const COMPRESSOR_PARAMS: ExpertParam[] = ['ratio', 'threshold_db', 'attack_ms', 'release_ms']
/** Le suivi du bruit est un oui / non : son code figure seul dans la clé, sans valeur. */
const DENOISE_TRACK_CODE = 'dt'

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

/**
 * Valeur de chaque réglage expert quand on n'y a pas touché, pour ces choix par paliers.
 * Le taux de compression et le seuil du débruiteur suivent en plus la mesure de la prise :
 * ils n'y figurent pas, voir `expertValues`.
 */
function presetValues(s: Pick<EnhanceSettings, 'eq' | 'bass'>): Partial<Record<ExpertParam, number>> {
	const amount = EQ_LEVEL_AMOUNT[s.eq]
	const [mud, presence, air] = EQ_FULL.map((band) => round1(band.gain_db * amount))
	return {
		denoise_db: 0,
		highpass_hz: HIGHPASS_HZ,
		mud_db: mud,
		presence_db: presence,
		air_db: air,
		bass_db: s.bass === 'cut' ? BASS_CUT.gain_db : s.bass === 'boost' ? BASS_BOOST.gain_db : 0,
		threshold_db: WORKING_LUFS - 4,
		attack_ms: 15,
		release_ms: 200,
		target_lufs: ENHANCE_TARGET_LUFS,
		limit_db: ENHANCE_LIMIT_DB
	}
}

/**
 * Ramène des réglages à leur forme la plus courte : un réglage expert qui vaut ce que les
 * paliers donnent déjà, ou qui ne s'applique pas (seuil d'un débruitage coupé, taux d'une
 * compression coupée), n'est pas gardé. Deux façons d'obtenir le même son ont ainsi la
 * même clé, donc le même aperçu.
 */
export function normalizeSettings(s: EnhanceSettings): EnhanceSettings {
	const base: EnhanceSettings = { eq: s.eq, bass: s.bass, compression: s.compression }
	if (!s.expert) return base
	const preset = presetValues(s)
	const expert: ExpertSettings = {}
	for (const name of EXPERT_PARAM_NAMES) {
		const value = s.expert[name]
		if (value === undefined || value === preset[name]) continue
		if (!s.compression && COMPRESSOR_PARAMS.includes(name)) continue
		expert[name] = value
	}
	if (expert.denoise_db === undefined) delete expert.denoise_floor_db
	else if (s.expert.denoise_track) expert.denoise_track = true
	return Object.keys(expert).length > 0 ? { ...base, expert } : base
}

/** Vrai si des réglages portent au moins un réglage expert. */
export function hasExpertSettings(s: EnhanceSettings | null): boolean {
	return !!s?.expert && Object.keys(s.expert).length > 0
}

/** Réglages experts reçus : `null` s'ils sont mal formés ou hors bornes. */
function parseExpertSettings(raw: unknown): ExpertSettings | null {
	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
	const expert: ExpertSettings = {}
	for (const [name, value] of Object.entries(raw)) {
		if (name === 'denoise_track') {
			if (typeof value !== 'boolean') return null
			if (value) expert.denoise_track = true
			continue
		}
		const spec = EXPERT_PARAMS[name as ExpertParam]
		if (!spec || typeof value !== 'number' || !Number.isFinite(value)) return null
		if (value < spec.min || value > spec.max) return null
		expert[name as ExpertParam] = snapExpertValue(name as ExpertParam, value)
	}
	return expert
}

/** Une valeur ramenée au pas de son réglage, dans ses bornes. */
export function snapExpertValue(name: ExpertParam, value: number): number {
	const { min, max, step } = EXPERT_PARAMS[name]
	return clamp(round1(Math.round(value / step) * step), min, max)
}

/** Réglages reçus du navigateur, ou relus d'un fichier : `null` s'ils sont mal formés. */
export function parseEnhanceSettings(raw: unknown): EnhanceSettings | null {
	if (typeof raw !== 'object' || raw === null) return null
	const { eq, bass, compression, expert: rawExpert } = raw as Record<string, unknown>
	if (!EQ_LEVELS.includes(eq as EqLevel) || typeof compression !== 'boolean') return null
	let expert: ExpertSettings | undefined
	if (rawExpert !== undefined && rawExpert !== null) {
		const parsed = parseExpertSettings(rawExpert)
		if (!parsed) return null
		expert = parsed
	}
	if (bass === undefined) {
		// Réglages gardés avant le choix du grave : le renfort faisait partie de l'égalisation.
		return normalizeSettings({ eq: eq as EqLevel, bass: eq === 'none' ? 'none' : 'boost', compression, expert })
	}
	if (!BASS_CHOICES.includes(bass as BassChoice)) return null
	return normalizeSettings({ eq: eq as EqLevel, bass: bass as BassChoice, compression, expert })
}

export function sameSettings(a: EnhanceSettings | null, b: EnhanceSettings | null): boolean {
	return !!a && !!b && settingsKey(a) === settingsKey(b)
}

/**
 * Les réglages en un mot (`full-boost-comp`, `soft-none-comp~dn12~pr2.5`) : le nom de leur
 * aperçu sur disque, et ce que l'écran demande à écouter. Chaque réglage essayé garde le
 * sien — y revenir ne coûte rien. Les réglages experts suivent, dans un ordre fixe, chacun
 * par son code et sa valeur.
 */
export function settingsKey(settings: EnhanceSettings): string {
	const s = normalizeSettings(settings)
	const parts = [`${s.eq}-${s.bass}-${s.compression ? 'comp' : 'flat'}`]
	for (const name of EXPERT_PARAM_NAMES) {
		const value = s.expert?.[name]
		if (value !== undefined) parts.push(`${EXPERT_PARAMS[name].code}${value}`)
	}
	if (s.expert?.denoise_track) parts.push(DENOISE_TRACK_CODE)
	return parts.join('~')
}

export function parseSettingsKey(key: string | null): EnhanceSettings | null {
	const [base, ...tokens] = (key ?? '').split('~')
	const [eq, bass, compression, ...rest] = base.split('-')
	if (rest.length > 0 || (compression !== 'comp' && compression !== 'flat')) return null
	const expert: Record<string, number | boolean> = {}
	for (const token of tokens) {
		if (token === DENOISE_TRACK_CODE) { expert.denoise_track = true; continue }
		// Un code et un nombre à une décimale au plus : rien d'autre n'entre dans un nom de fichier.
		const match = /^([a-z]{2})(-?\d+(?:\.\d)?)$/.exec(token)
		const name = match && EXPERT_PARAM_NAMES.find((n) => EXPERT_PARAMS[n].code === match[1])
		if (!match || !name || name in expert) return null
		expert[name] = Number(match[2])
	}
	const settings = parseEnhanceSettings({
		eq, bass: bass ?? null, compression: compression === 'comp',
		...(tokens.length > 0 ? { expert } : {})
	})
	// Une clé ne se relit que sous sa forme canonique : un seul nom de fichier par réglage.
	return settings && settingsKey(settings) === key ? settings : null
}

/** Niveau de travail du compresseur : son seuil n'a de sens que pour un niveau connu. */
const WORKING_LUFS = -20
const MAX_PRE_GAIN_DB = 24
const MAX_CUT_DB = -20
/**
 * Le grondement (manipulation, ventilation, trafic) vit sous 35 Hz. Plus haut, la coupe
 * mordrait sur le mi grave d'une basse (41 Hz) : « léger » est ici une contrainte. Les
 * toutes premières notes d'un piano (la 0, 27,5 Hz) y perdent leur fondamentale, qu'une
 * prise de salle ne capte guère : l'oreille les entend par leurs harmoniques.
 */
const HIGHPASS_HZ = 35

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
	/**
	 * Débruitage, en tête de chaîne : le seuil est sur l'échelle du fichier d'origine,
	 * avant tout gain. `null` sans — c'est le cas hors du mode expert.
	 */
	denoise: { reduction_db: number; floor_db: number; track: boolean } | null
	/** Gain d'entrée, qui amène le son au niveau de travail du compresseur. */
	pre_gain_db: number
	/** `null` sans coupe-bas. */
	highpass_hz: number | null
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

/**
 * La valeur de chaque réglage expert pour cette prise : celle qu'on a réglée à la main,
 * sinon celle que donnent les paliers et la mesure. C'est ce que montrent les curseurs,
 * et ce dont la chaîne est faite.
 */
export function expertValues(a: AudioAnalysis, settings: EnhanceSettings): Record<ExpertParam, number> {
	return {
		...presetValues(settings),
		denoise_floor_db: autoDenoiseFloor(a.profile),
		// Un son déjà tenu n'a pas à l'être davantage ; un son aux grands écarts, un peu plus.
		ratio: a.lra_lu <= 8 ? 1.5 : a.lra_lu <= 14 ? 2 : 2.5,
		...numericExpert(settings.expert)
	} as Record<ExpertParam, number>
}

function numericExpert(expert: ExpertSettings | undefined): Partial<Record<ExpertParam, number>> {
	const values: Partial<Record<ExpertParam, number>> = {}
	for (const name of EXPERT_PARAM_NAMES) {
		const value = expert?.[name]
		if (value !== undefined) values[name] = value
	}
	return values
}

export function enhancePlan(a: AudioAnalysis, settings: EnhanceSettings = proposedSettings(a)): EnhancePlan {
	const v = expertValues(a, settings)
	const gains = [v.mud_db, v.presence_db, v.air_db]
	return {
		denoise: v.denoise_db > 0
			? { reduction_db: v.denoise_db, floor_db: v.denoise_floor_db, track: settings.expert?.denoise_track === true }
			: null,
		pre_gain_db: round1(clamp(WORKING_LUFS - a.integrated_lufs, MAX_CUT_DB, MAX_PRE_GAIN_DB)),
		highpass_hz: v.highpass_hz > 0 ? v.highpass_hz : null,
		eq: EQ_FULL.map((band, i) => ({ ...band, gain_db: gains[i] })).filter((band) => band.gain_db !== 0),
		// Seuil par défaut quelques dB sous le niveau de travail : seuls les passages forts sont tenus.
		compressor: settings.compression
			? { threshold_db: v.threshold_db, ratio: v.ratio, attack_ms: v.attack_ms, release_ms: v.release_ms }
			: null,
		bass_boost: v.bass_db > 0 ? { ...BASS_BOOST, gain_db: v.bass_db } : null,
		bass_cut: v.bass_db < 0 ? { ...BASS_CUT, gain_db: v.bass_db } : null,
		target_lufs: v.target_lufs,
		limit_db: v.limit_db
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
