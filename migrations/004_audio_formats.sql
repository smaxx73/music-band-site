-- Migration 004 : formats audio autorisés à l'upload

CREATE TABLE audio_formats (
    id         SERIAL PRIMARY KEY,
    label      TEXT NOT NULL,
    mime_types TEXT[] NOT NULL,
    enabled    BOOLEAN NOT NULL DEFAULT true
);

INSERT INTO audio_formats (label, mime_types, enabled) VALUES
    ('MP3',      ARRAY['audio/mpeg', 'audio/mp3'],                          true),
    ('WAV',      ARRAY['audio/wav', 'audio/x-wav'],                         true),
    ('FLAC',     ARRAY['audio/flac', 'audio/x-flac'],                       true),
    ('AAC / M4A',ARRAY['audio/aac', 'audio/mp4', 'audio/m4a', 'audio/x-m4a'], true),
    ('OGG',      ARRAY['audio/ogg'],                                         true),
    ('Opus',     ARRAY['audio/opus'],                                        true),
    ('WebM',     ARRAY['audio/webm', 'video/webm'],                          true),
    ('MP4 vidéo',ARRAY['video/mp4'],                                         false);
