-- Migration 028 : notification des mentions
-- Un membre mentionné (@pseudo) dans un commentaire reçoit une notification 'mention',
-- à la place du 'comment' générique que reçoit le reste du groupe.

ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN ('recording', 'comment', 'mention', 'session', 'playlist', 'agenda'));
