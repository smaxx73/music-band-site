-- Migration 052 : heure, durée et présences d'un événement d'agenda
--
-- Un événement de groupe à venir demande à chaque membre s'il vient : présent, peut-être,
-- absent. C'est l'événement qui porte la question, pas la session : toute session a son
-- événement, et un événement transformé en session garde sa ligne — les réponses suivent.
--
-- L'heure est locale au groupe (TIME, sans fuseau) ; la durée se déduit de l'heure de
-- fin saisie, ce qui laisse une fin après minuit sans cas particulier.

BEGIN;

ALTER TABLE calendar_events
    ADD COLUMN start_time   TIME,
    ADD COLUMN duration_min INTEGER CHECK (duration_min BETWEEN 1 AND 1440),
    -- La question a été posée au groupe : à la création d'une date à venir, ou à la
    -- demande (« Demander les présences »). Remise à zéro quand la date change.
    ADD COLUMN attendance_requested BOOLEAN NOT NULL DEFAULT false,
    ADD CONSTRAINT calendar_events_duration_start CHECK (duration_min IS NULL OR start_time IS NOT NULL);

-- Les dates déjà prévues posent la question elles aussi, sans notification : elle
-- attend dans « À toi » du tableau de bord.
UPDATE calendar_events
SET attendance_requested = true
WHERE group_id IS NOT NULL AND type <> 'indisponibilite' AND date > CURRENT_DATE;

CREATE TABLE event_attendance (
    event_id    INTEGER NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    response    TEXT NOT NULL CHECK (response IN ('present', 'maybe', 'absent')),
    note        TEXT,
    answered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (event_id, user_id)
);

-- La notification de présence porte l'événement : on y répond depuis la cloche.
ALTER TABLE notifications
    ADD COLUMN event_id INTEGER REFERENCES calendar_events(id) ON DELETE CASCADE;

ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN ('recording', 'comment', 'mention', 'session', 'playlist', 'agenda', 'setlist', 'post', 'attendance'));

COMMIT;
