-- 001_init.sql — initialisation du schéma

CREATE TABLE songs (
    id          SERIAL PRIMARY KEY,
    title       TEXT NOT NULL UNIQUE,
    composer    TEXT,
    key         TEXT,                        -- ex: "Dm", "Bb"
    status      TEXT DEFAULT 'en_apprentissage',
                                             -- en_apprentissage | au_repertoire | abandonne
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE sessions (
    id          SERIAL PRIMARY KEY,
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
    name        TEXT NOT NULL,
    description TEXT,
    created_by  TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE playlist_items (
    id           SERIAL PRIMARY KEY,
    playlist_id  INTEGER REFERENCES playlists(id) ON DELETE CASCADE,
    recording_id INTEGER REFERENCES recordings(id) ON DELETE CASCADE,
    position     INTEGER NOT NULL,           -- ordre dans la playlist
    note         TEXT,                       -- ex: "version live Ducasse"
    UNIQUE (playlist_id, position)
);
