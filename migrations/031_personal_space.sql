-- Migration 031 : espace personnel et publications
--
-- L'espace perso est un carnet à soi, hors de tout groupe : il appartient à un
-- utilisateur, pas à un groupe, et personne d'autre ne le lit. Il n'entre dans un
-- groupe que par une publication, qui le désigne sans le copier : l'auteur garde la
-- main sur ce qu'il a publié, et le supprimer retire aussi ce qu'il avait montré.

CREATE TABLE personal_recordings (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    notes       TEXT,
    -- Même forme qu'une prise : une piste audio, une vidéo YouTube, ou les deux.
    file_path   TEXT,                        -- "perso/{id}.mp3", relatif à AUDIO_DIR
    youtube_video_id TEXT CHECK (youtube_video_id ~ '^[A-Za-z0-9_-]{11}$'),
    youtube_title TEXT,
    source_file_name TEXT,
    duration_s  INTEGER,
    file_hash   TEXT,                        -- doublon cherché dans l'espace du seul propriétaire
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ,
    CONSTRAINT personal_recordings_source CHECK (file_path IS NOT NULL OR youtube_video_id IS NOT NULL)
);

-- Ce qu'un membre apporte au groupe depuis l'extérieur des répétitions.
CREATE TABLE posts (
    id          SERIAL PRIMARY KEY,
    group_id    INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    type        TEXT NOT NULL CHECK (type IN ('recording', 'youtube', 'song_suggestion')),
    message     TEXT,
    author      TEXT NOT NULL,
    author_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    -- Renvoi, pas copie : la publication tombe avec l'enregistrement qu'elle montre.
    personal_recording_id INTEGER REFERENCES personal_recordings(id) ON DELETE CASCADE,
    youtube_video_id TEXT CHECK (youtube_video_id ~ '^[A-Za-z0-9_-]{11}$'),
    youtube_title TEXT,
    song_title  TEXT,                        -- suggestion : le morceau proposé
    song_artist TEXT,
    -- Morceau créé depuis la suggestion ; supprimé du référentiel, la suggestion
    -- redevient ajoutable.
    song_id     INTEGER REFERENCES songs(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    edited_at   TIMESTAMPTZ,
    CONSTRAINT posts_shape CHECK (
        (type = 'recording'       AND personal_recording_id IS NOT NULL)
     OR (type = 'youtube'         AND personal_recording_id IS NULL AND youtube_video_id IS NOT NULL)
     OR (type = 'song_suggestion' AND personal_recording_id IS NULL AND song_title IS NOT NULL)
    ),
    -- Publié dans plusieurs groupes, oui ; deux fois dans le même, non.
    UNIQUE (group_id, personal_recording_id)
);

-- Troisième cible des commentaires : mêmes réactions, mêmes mentions, même édition.
ALTER TABLE comments ADD COLUMN post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE;
ALTER TABLE comments DROP CONSTRAINT comments_target;
ALTER TABLE comments ADD CONSTRAINT comments_target
    CHECK (num_nonnulls(recording_id, setlist_id, post_id) = 1);

ALTER TABLE notifications ADD COLUMN post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE;
ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN ('recording', 'comment', 'mention', 'session', 'playlist', 'agenda', 'setlist', 'post'));

CREATE INDEX idx_personal_recordings_user ON personal_recordings(user_id, created_at DESC);
CREATE INDEX idx_personal_recordings_hash ON personal_recordings(user_id, file_hash);
CREATE INDEX idx_posts_group            ON posts(group_id, created_at DESC);
CREATE INDEX idx_posts_personal         ON posts(personal_recording_id) WHERE personal_recording_id IS NOT NULL;
CREATE INDEX idx_comments_post          ON comments(post_id) WHERE post_id IS NOT NULL;
