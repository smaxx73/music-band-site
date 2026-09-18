/**
 * Destination mise de côté avant une redirection vers `/login`, nettoyée.
 *
 * Un lien partagé arrive souvent sur une session expirée : sans cette mémoire, il
 * atterrit sur le tableau de bord et il faut redire de vive voix ce qu'on partageait.
 *
 * La valeur vient de l'URL, donc de n'importe qui. Seul un chemin interne est accepté :
 * `//exemple.com` et `/\exemple.com` sont des URL absolues pour le navigateur, les
 * laisser passer ferait du formulaire de connexion une redirection ouverte.
 */
export function safeRedirectTarget(raw: string | null | undefined): string | null {
	if (!raw) return null
	if (!raw.startsWith('/')) return null
	if (raw.startsWith('//') || raw.startsWith('/\\')) return null
	return raw
}

/**
 * URL de connexion qui ramènera à `url`.
 *
 * Le layout et les `load` de page gardent l'accès en parallèle : sans la destination des
 * deux côtés, celui qui redirige le premier déciderait si le lien survit à la connexion.
 */
export function loginRedirect(url: URL): string {
	const target = safeRedirectTarget(url.pathname + url.search)
	return target ? `/login?redirectTo=${encodeURIComponent(target)}` : '/login'
}
