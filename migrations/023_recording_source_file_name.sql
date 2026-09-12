-- 023_recording_source_file_name.sql
-- Nom du fichier tel qu'il a été déposé, conservé sur la prise.
--
-- `file_path` vaut toujours "{id}.mp3" : unique, mais muet. Il dit où est le fichier
-- sur le disque, pas de quel enregistrement il vient. Retrouver « le ZOOM0042 de la
-- répète du 12 » demandait jusqu'ici de rouvrir chaque prise à l'oreille.
--
-- Nullable et sans valeur de repli : les prises antérieures à cette migration n'ont
-- pas de nom d'origine, et il est irrécupérable — l'information n'a jamais été écrite.
-- L'écran retombe alors sur `file_path`.

ALTER TABLE recordings
    ADD COLUMN source_file_name TEXT;       -- nom d'origine, seulement pour l'affichage
                                            -- (jamais utilisé comme chemin : voir storage.ts)
