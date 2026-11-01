-- Un recadrage à l'envoi se défait : des membres coupaient sans s'en rendre compte, et le
-- passage écarté était perdu. Il est gardé à part, sans rien dupliquer : `{id}.mp3` ne porte
-- que le passage écouté, `{id}.head` et `{id}.tail` ce qui l'entourait, et les trois recollés
-- redonnent le fichier entier (`perso/{id}.…` pour un enregistrement perso).
-- Bornes renseignées = ces deux fichiers existent. Rien à reprendre pour l'existant : le
-- passage écarté n'a jamais été gardé.
-- Un recadrage suivi d'une découpe ne coupe rien : l'import garde tout son fichier et retient
-- les bornes, pour présenter ce qu'elles écartent comme déjà écarté sur l'écran de découpe.
BEGIN;

ALTER TABLE recordings
    ADD COLUMN trim_start_s DOUBLE PRECISION,
    ADD COLUMN trim_end_s   DOUBLE PRECISION,
    ADD COLUMN source_file_hash TEXT,
    ADD CONSTRAINT recordings_trim CHECK (num_nonnulls(trim_start_s, trim_end_s, source_file_hash) IN (0, 3));

ALTER TABLE personal_recordings
    ADD COLUMN trim_start_s DOUBLE PRECISION,
    ADD COLUMN trim_end_s   DOUBLE PRECISION,
    ADD COLUMN source_file_hash TEXT,
    ADD CONSTRAINT personal_recordings_trim CHECK (num_nonnulls(trim_start_s, trim_end_s, source_file_hash) IN (0, 3));

ALTER TABLE audio_imports
    ADD COLUMN trim_start_s DOUBLE PRECISION,
    ADD COLUMN trim_end_s   DOUBLE PRECISION,
    ADD CONSTRAINT audio_imports_trim CHECK ((trim_start_s IS NULL) = (trim_end_s IS NULL));

COMMIT;
