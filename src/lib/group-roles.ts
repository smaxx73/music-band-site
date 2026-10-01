import type { ConfirmRequest } from '$lib/confirm-submit.svelte'

/**
 * Question posée avant de changer le rôle d'un membre dans un groupe, depuis `/group`
 * comme depuis `/admin/groups/[id]`. Le `<select>` a déjà changé de valeur quand on la
 * pose : y renoncer le remet sur le rôle actuel.
 */
export function groupRoleChangeRequest(form: HTMLFormElement, memberName: string, currentRole: string): ConfirmRequest {
	const select = form.elements.namedItem('role') as HTMLSelectElement
	const granting = select.value === 'admin'
	return {
		level: 'info',
		title: granting ? 'Nommer admin du groupe ?' : 'Retirer le rôle d’admin ?',
		message: granting
			? `${memberName} pourra gérer les membres, le nom, le logo, les liens et les lieux du groupe, et supprimer le contenu des autres.`
			: `${memberName} redeviendra simple membre du groupe.`,
		confirmLabel: granting ? 'Nommer admin' : 'Retirer le rôle',
		onCancel: () => (select.value = currentRole)
	}
}

/** Question posée avant de retirer un membre d'un groupe. */
export function removeMemberRequest(memberName: string): ConfirmRequest {
	return {
		level: 'warning',
		title: 'Retirer ce membre ?',
		message: `${memberName} n'aura plus accès au groupe. Ses sessions, prises et commentaires y restent, et il pourra y être ajouté de nouveau.`,
		confirmLabel: 'Retirer du groupe'
	}
}
