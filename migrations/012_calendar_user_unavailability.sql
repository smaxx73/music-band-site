-- Les indisponibilités sont personnelles (liées à l'utilisateur, pas au groupe).
-- On détache group_id pour ce type et on ajoute user_id.

ALTER TABLE calendar_events ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- group_id peut désormais être NULL (pour les indisponibilités personnelles)
ALTER TABLE calendar_events ALTER COLUMN group_id DROP NOT NULL;

-- Rattacher les indisponibilités existantes à leur utilisateur
UPDATE calendar_events e
SET user_id = u.id
FROM users u
WHERE e.type = 'indisponibilite' AND u.name = e.author;

-- Détacher les indisponibilités du groupe
UPDATE calendar_events SET group_id = NULL WHERE type = 'indisponibilite';

CREATE INDEX idx_calendar_events_user ON calendar_events(user_id) WHERE user_id IS NOT NULL;
