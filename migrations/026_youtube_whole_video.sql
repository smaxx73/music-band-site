-- Migration 026 : une prise porte une piste audio, une vidéo YouTube, ou les deux
-- La 025 prévoyait des extraits bornés dans une vidéo longue, exclusifs d'un fichier audio.
-- Finalement : une vidéo = un morceau (plus de bornes), et une prise vidéo peut aussi avoir
-- sa piste audio, jouée dans le lecteur et les playlists. `kind` n'a donc plus de sens :
-- « a une piste audio » = file_path IS NOT NULL, « a une vidéo » = youtube_video_id IS NOT NULL.

ALTER TABLE recordings DROP CONSTRAINT recordings_source;

-- Titre de la vidéo, distinct du nom du fichier audio déposé à côté.
ALTER TABLE recordings ADD COLUMN youtube_title TEXT;
UPDATE recordings SET youtube_title = source_file_name, source_file_name = NULL
WHERE kind = 'youtube';

ALTER TABLE recordings
    DROP COLUMN start_s,
    DROP COLUMN end_s,
    DROP COLUMN kind;

ALTER TABLE recordings ADD CONSTRAINT recordings_source CHECK (
    file_path IS NOT NULL OR youtube_video_id IS NOT NULL
);
