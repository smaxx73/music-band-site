-- Migration 054 : écoutes d'une prise par les membres
--
-- Une ligne par membre, par prise et par jour : réécouter dix fois le même passage un
-- soir reste une écoute, revenir la semaine suivante en fait une autre. Le jour suffit
-- à dire « écoutée récemment » ou « plus écoutée depuis des mois » sans garder l'heure
-- de chaque lecture. C'est le navigateur qui décide qu'il y a eu écoute (30 s lues, ou
-- la moitié d'une prise courte) : les requêtes du fichier audio, découpées en plages et
-- préchargées, ne disent rien de ce qui a été entendu. Voir src/lib/listen-meter.ts.
--
-- Rien n'existe avant cette migration : une prise ancienne n'a « jamais été écoutée »
-- que depuis le déploiement.

BEGIN;

CREATE TABLE recording_listens (
    recording_id INTEGER NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day          DATE NOT NULL DEFAULT CURRENT_DATE,
    PRIMARY KEY (recording_id, user_id, day)
);

CREATE INDEX idx_recording_listens_user ON recording_listens(user_id);

COMMIT;
