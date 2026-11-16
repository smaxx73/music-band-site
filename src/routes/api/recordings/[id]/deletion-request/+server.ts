import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { canDeleteGroupContent } from '$lib/types'
import {
	deletionRequestRecipients,
	findDeletionTarget,
	myDeletionRequestAt,
	parseDeletionReason,
	sendDeletionRequest,
	DELETION_REASON_MAX,
	type DeletionRequestTarget
} from '$lib/server/deletion-requests'

// Demander la suppression d'une prise qu'on n'a pas le droit de supprimer soi-même.
// Voir src/lib/server/deletion-requests.ts.

type Resolved =
	| { error: Response }
	| { user: NonNullable<App.Locals['user']>; groupId: number; target: DeletionRequestTarget }

async function resolve(locals: App.Locals, rawId: string): Promise<Resolved> {
	if (!locals.user) return { error: json({ error: 'Non autorisé' }, { status: 401 }) }
	const groupId = locals.user.current_group_id
	if (!groupId) return { error: json({ error: 'Aucun groupe actif.' }, { status: 403 }) }

	const id = parseInt(rawId)
	if (isNaN(id)) return { error: json({ error: 'ID invalide.' }, { status: 400 }) }

	const target = await findDeletionTarget(id, groupId)
	if (!target) return { error: json({ error: 'Prise introuvable.' }, { status: 404 }) }

	if (canDeleteGroupContent(locals.user, groupId, target.uploaded_by_user_id)) {
		return { error: json({ error: 'Tu peux supprimer cette prise toi-même.' }, { status: 400 }) }
	}
	return { user: locals.user, groupId, target }
}

/** Qui recevra la demande, et la dernière déjà faite par ce membre. */
export const GET: RequestHandler = async ({ locals, params }) => {
	const resolved = await resolve(locals, params.id)
	if ('error' in resolved) return resolved.error
	const { user, groupId, target } = resolved

	const [recipients, requestedAt] = await Promise.all([
		deletionRequestRecipients(target, groupId, user.id),
		myDeletionRequestAt(target.id, user.id)
	])
	return json({ recipients, requested_at: requestedAt })
}

/** Envoie la demande (`{ reason? }`) ; redemander remplace la précédente. */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const resolved = await resolve(locals, params.id)
	if ('error' in resolved) return resolved.error
	const { user, groupId, target } = resolved

	let body: unknown = {}
	try {
		body = await request.json()
	} catch {
		// Corps vide : une demande sans motif.
	}
	const reason = parseDeletionReason((body as { reason?: unknown } | null)?.reason)
	if (reason === undefined) {
		return json({ error: `Le motif ne doit pas dépasser ${DELETION_REASON_MAX} caractères.` }, { status: 400 })
	}

	const outcome = await sendDeletionRequest(target, groupId, { id: user.id, display_name: user.display_name }, reason)
	if (!outcome.ok) return json({ error: outcome.error }, { status: outcome.status })
	return json({ recipients: outcome.recipients, requested_at: outcome.requested_at }, { status: 201 })
}
