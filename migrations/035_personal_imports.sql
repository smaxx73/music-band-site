-- Migration 035 : découpe d'un enregistrement vers l'espace perso
--
-- Un long enregistrement fait seul (une séance de travail, plusieurs idées d'affilée) se
-- découpe comme une répétition, mais chaque passage devient un enregistrement de l'espace
-- perso, pas une prise du groupe. Un tel import n'appartient à aucun groupe : group_id
-- NULL, et donc pas de session non plus. Il reste personnel, filtré par user_id comme
-- tout import.

ALTER TABLE audio_imports ALTER COLUMN group_id DROP NOT NULL;

ALTER TABLE audio_imports ADD CONSTRAINT audio_imports_personal_no_session
    CHECK (group_id IS NOT NULL OR session_id IS NULL);
