-- schema.sql — source de vérité
-- Toute modification du schéma = nouveau fichier dans migrations/

CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    name          TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'user',  -- 'admin' | 'user'
    active        BOOLEAN NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE groups (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE user_groups (
    user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
    group_id    INTEGER REFERENCES groups(id) ON DELETE CASCADE,
    role        TEXT NOT NULL DEFAULT 'member',  -- 'admin' | 'member'
    joined_at   TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_id, group_id)
);

CREATE TABLE songs (
    id          SERIAL PRIMARY KEY,
    group_id    INTEGER NOT NULL REFERENCES groups(id),
    title       TEXT NOT NULL,
    composer    TEXT,
    key         TEXT,                        -- ex: "Dm", "Bb"
    lyrics      TEXT,
    music_notes TEXT,                        -- accords, structure, tempo, remarques musicales
    status      TEXT DEFAULT 'en_apprentissage',
                                             -- en_apprentissage | au_repertoire | abandonne
    created_at  TIMESTAMPTZ DEFAULT now(),
    UNIQUE (group_id, title)
);

CREATE TABLE sessions (
    id          SERIAL PRIMARY KEY,
    group_id    INTEGER NOT NULL REFERENCES groups(id),
    date        DATE NOT NULL,
    location    TEXT,
    notes       TEXT,
    members     TEXT[],                      -- ["Marc", "Julie", "Thomas"]
    created_by  TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE recordings (
    id          SERIAL PRIMARY KEY,
    session_id  INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
    song_id     INTEGER REFERENCES songs(id),
    take        INTEGER NOT NULL DEFAULT 1,  -- calculé automatiquement, jamais saisi manuellement
    file_path   TEXT NOT NULL,               -- "{id}.mp3"
    duration_s  INTEGER,
    status      TEXT DEFAULT 'en_cours',     -- en_cours | au_point | repertoire
    notes       TEXT,
    uploaded_by TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT now(),
    UNIQUE (session_id, song_id, take)
);

-- Calcul du take à l'upload (dans une transaction) :
-- SELECT COALESCE(MAX(take), 0) + 1 FROM recordings WHERE session_id = $1 AND song_id = $2;

CREATE TABLE comments (
    id           SERIAL PRIMARY KEY,
    recording_id INTEGER REFERENCES recordings(id) ON DELETE CASCADE,
    author       TEXT NOT NULL,
    content      TEXT NOT NULL,
    timestamp_s  FLOAT,                      -- null = commentaire global
    created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE playlists (
    id          SERIAL PRIMARY KEY,
    group_id    INTEGER NOT NULL REFERENCES groups(id),
    name        TEXT NOT NULL,
    description TEXT,
    created_by  TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ
);

CREATE TABLE playlist_items (
    id           SERIAL PRIMARY KEY,
    playlist_id  INTEGER REFERENCES playlists(id) ON DELETE CASCADE,
    recording_id INTEGER REFERENCES recordings(id) ON DELETE CASCADE,
    position     INTEGER NOT NULL,           -- ordre dans la playlist
    note         TEXT,                       -- ex: "version live Ducasse"
    UNIQUE (playlist_id, position)
);

CREATE TABLE audio_formats (
    id          SERIAL PRIMARY KEY,
    label       TEXT NOT NULL,
    mime_types  TEXT[] NOT NULL,
    enabled     BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX idx_songs_group_id     ON songs(group_id);
CREATE INDEX idx_sessions_group_id  ON sessions(group_id);
CREATE INDEX idx_playlists_group_id ON playlists(group_id);
CREATE INDEX idx_user_groups_user   ON user_groups(user_id);
CREATE INDEX idx_user_groups_group  ON user_groups(group_id);
