-- Migration 055 : programme de travail d'un événement d'agenda
--
-- Ce qu'on prévoit de travailler à une date : des morceaux du référentiel, dans l'ordre.
-- C'est l'événement qui le porte, comme les présences : toute session a le sien, et un
-- événement transformé en session garde sa ligne — le programme suit.
--
-- Une table à part des setlists : une setlist est un objet durable, nommé et commenté ; un
-- programme ne vaut que pour sa date, et n'a pas à remplir /setlists.

BEGIN;

CREATE TABLE event_program_songs (
    event_id    INTEGER NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
    song_id     INTEGER NOT NULL REFERENCES songs(id)           ON DELETE CASCADE,
    position    INTEGER NOT NULL,
    PRIMARY KEY (event_id, song_id),
    UNIQUE (event_id, position)
);

COMMIT;
