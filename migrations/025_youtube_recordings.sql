-- Migration 025 : prises YouTube
-- Une prise peut pointer vers un extrait d'une vidéo YouTube (typiquement un live en ligne)
-- au lieu d'un fichier audio. Rien n'est téléchargé : on stocke l'identifiant de la vidéo
-- et les bornes de l'extrait, la lecture passe par le lecteur intégré de YouTube.

ALTER TABLE recordings
    ADD COLUMN kind TEXT NOT NULL DEFAULT 'audio' CHECK (kind IN ('audio', 'youtube')),
    ADD COLUMN youtube_video_id TEXT CHECK (youtube_video_id ~ '^[A-Za-z0-9_-]{11}$'),
    ADD COLUMN start_s INTEGER,
    ADD COLUMN end_s   INTEGER;

ALTER TABLE recordings ALTER COLUMN file_path DROP NOT NULL;

ALTER TABLE recordings ADD CONSTRAINT recordings_source CHECK (
    (kind = 'audio'
        AND file_path IS NOT NULL
        AND youtube_video_id IS NULL AND start_s IS NULL AND end_s IS NULL)
    OR
    (kind = 'youtube'
        AND file_path IS NULL
        AND youtube_video_id IS NOT NULL
        AND start_s >= 0 AND end_s > start_s)
);

CREATE INDEX idx_recordings_youtube_video ON recordings(youtube_video_id) WHERE youtube_video_id IS NOT NULL;
