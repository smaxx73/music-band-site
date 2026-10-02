-- La session d'un import n'est que celle proposée à la découpe : la supprimer ne doit
-- pas emporter l'import, qui peut être celui d'un autre membre. L'import reste, sans
-- session ; l'écran de découpe en fait choisir une avant de valider.
BEGIN;

ALTER TABLE audio_imports DROP CONSTRAINT audio_imports_session_id_fkey;
ALTER TABLE audio_imports
    ADD CONSTRAINT audio_imports_session_id_fkey
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL;

COMMIT;
