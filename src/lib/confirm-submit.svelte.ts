export type ConfirmRequest = {
	title: string
	message: string
	confirmLabel: string
	/** Voir « Confirmations d'action » dans docs/conventions.md. */
	level?: 'info' | 'warning' | 'danger'
	/** Appelé si l'on renonce : remettre un `<select>` sur sa valeur, par exemple. */
	onCancel?: () => void
}

/**
 * Confirmation d'un formulaire `use:enhance` par `ConfirmDialog`.
 *
 * Un `onsubmit` qui appelle `preventDefault()` n'arrête PAS un formulaire amélioré :
 * le gestionnaire de SvelteKit ne regarde pas `defaultPrevented` et envoie quand même.
 * Le seul arrêt fiable est le `cancel()` reçu par la fonction passée à `enhance`. On
 * annule donc le premier envoi, on pose la question, et la réponse « oui » relance le
 * formulaire, qui passe alors sans question.
 */
export function createSubmitConfirm() {
	let pending = $state<(ConfirmRequest & { form: HTMLFormElement }) | null>(null)
	const approved = new WeakSet<HTMLFormElement>()

	return {
		get pending() {
			return pending
		},

		/** En tête de la fonction `enhance` : vrai si l'envoi attend la réponse. */
		intercept(form: HTMLFormElement, cancel: () => void, request: ConfirmRequest): boolean {
			if (approved.has(form)) {
				approved.delete(form)
				return false
			}
			cancel()
			pending = { ...request, form }
			return true
		},

		confirm() {
			if (!pending) return
			const { form } = pending
			pending = null
			approved.add(form)
			form.requestSubmit()
		},

		dismiss() {
			pending?.onCancel?.()
			pending = null
		}
	}
}
