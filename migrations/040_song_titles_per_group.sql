-- Migration 040 : un titre de morceau est unique dans son groupe, pas dans l'application.
-- La migration 005 a ajouté group_id sans remplacer l'unicité globale de 001.
-- Une seule instruction remplace la contrainte atomiquement, sans modifier les morceaux.

ALTER TABLE songs
    DROP CONSTRAINT songs_title_key,
    ADD CONSTRAINT songs_group_id_title_key UNIQUE (group_id, title);
