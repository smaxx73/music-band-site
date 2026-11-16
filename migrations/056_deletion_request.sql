-- Migration 056 : demande de suppression d'une prise
--
-- Un membre qui n'a pas le droit de supprimer une prise (ni déposant, ni admin du groupe)
-- peut demander qu'on la supprime. La demande n'est qu'une notification, adressée à ceux
-- qui le peuvent : rien d'autre n'est gardé. Elle part avec la prise (recording_id en
-- ON DELETE CASCADE) — une prise supprimée n'a plus de demande en cours.
-- Voir src/lib/server/deletion-requests.ts.

BEGIN;

ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN ('recording', 'comment', 'mention', 'session', 'playlist', 'agenda', 'setlist', 'post', 'attendance', 'deletion_request'));

COMMIT;
