/**
 * Informations légales affichées par /mentions-legales et /confidentialite.
 *
 * Regroupées ici pour qu'un changement de bureau, d'adresse ou d'hébergeur se corrige
 * à un seul endroit. Les champs valant `TO_COMPLETE` sont exigés par la loi (LCEN
 * art. 6, RGPD art. 13) mais inconnus au moment de l'écriture : ils s'affichent tels
 * quels tant qu'ils ne sont pas renseignés, plutôt que d'inventer une valeur.
 */

export const TO_COMPLETE = '[à compléter]'

export const LEGAL = {
	siteName: 'BandStash',
	siteUrl: 'https://music.maximenguyen.fr',
	lastUpdated: '23 septembre 2026',

	publisher: {
		name: 'Rock and More',
		legalForm: 'Association loi 1901',
		website: 'https://rockandmore.org',
		address: `${TO_COMPLETE} — Guichen (35580)`,
		rna: 'W352006491',
		siren: '988 190 054',
		email: 'ngmaxime@gmail.com'
	},

	// Représentant légal de l'association, en principe son président ou sa présidente.
	publicationDirector: TO_COMPLETE,

	host: {
		name: 'IONOS SARL',
		address: '7 place de la Gare, BP 70109, 57201 Sarreguemines Cedex, France',
		phone: '09 70 80 89 11',
		website: 'https://www.ionos.fr',
		// Pays du centre de données du VPS (espace client IONOS) : conditionne la mention
		// d'un transfert hors Union européenne dans la politique de confidentialité.
		serverLocation: TO_COMPLETE
	},

	// Durée de conservation des journaux d'accès de Caddy (rotation par défaut : 90 jours).
	accessLogRetentionDays: 90
} as const
