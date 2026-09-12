-- schema.sql — source de vérité
-- Toute modification du schéma = nouveau fichier dans migrations/

CREATE TABLE users (
    id                  SERIAL PRIMARY KEY,
    nickname            TEXT NOT NULL UNIQUE,
    first_name          TEXT,
    last_name           TEXT,
    display_name_format TEXT NOT NULL DEFAULT 'nickname'
                        CHECK (display_name_format IN ('nickname', 'first_name', 'first_name_last_initial', 'first_name_last_name')),
    -- Le nom affiché est toujours replié sur le pseudo si les champs nécessaires ne sont pas renseignés.
    display_name        TEXT GENERATED ALWAYS AS (
                        CASE
                            WHEN display_name_format = 'first_name'
                                AND NULLIF(btrim(first_name), '') IS NOT NULL
                                THEN btrim(first_name)
                            WHEN display_name_format = 'first_name_last_initial'
                                AND NULLIF(btrim(first_name), '') IS NOT NULL
                                AND NULLIF(btrim(last_name), '') IS NOT NULL
                                THEN btrim(first_name) || ' ' || left(btrim(last_name), 1) || '.'
                            WHEN display_name_format = 'first_name_last_name'
                                AND NULLIF(btrim(first_name), '') IS NOT NULL
                                AND NULLIF(btrim(last_name), '') IS NOT NULL
                                THEN btrim(first_name) || ' ' || btrim(last_name)
                            ELSE nickname
                        END
                    ) STORED,
    password_hash       TEXT NOT NULL,
    role                TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin', 'superadmin')),
                                                  -- superadmin = tous les pouvoirs d'admin,
                                                  -- + seul rôle pouvant gérer les comptes admin/superadmin
    active              BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE groups (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ DEFAULT now(),
    youtube_url   TEXT,                      -- liens normalisés en https par src/lib/server/groups.ts
    facebook_url  TEXT,
    instagram_url TEXT
);

-- Logo du groupe, en base : il suit le groupe dans pg_dump et part avec lui.
-- Table à part pour que `SELECT g.*` ne remonte jamais les octets de l'image.
CREATE TABLE group_logos (
    group_id    INTEGER PRIMARY KEY REFERENCES groups(id) ON DELETE CASCADE,
    mime_type   TEXT NOT NULL CHECK (mime_type IN ('image/png', 'image/jpeg', 'image/webp', 'image/gif')),
                                             -- pas de SVG : servi depuis notre origine, il pourrait exécuter du script
    data        BYTEA NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
                                             -- sert aussi de version dans l'URL, pour le cache navigateur
);

CREATE TABLE user_groups (
    user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
    group_id    INTEGER REFERENCES groups(id) ON DELETE CASCADE,
    role        TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
                                             -- 'admin' = administrateur de CE groupe (membres, nom,
                                             -- suppression du contenu d'autrui). Attribué par le
                                             -- superadmin uniquement — voir src/lib/types.ts.
    joined_at   TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_id, group_id)
);

CREATE TABLE songs (
    id          SERIAL PRIMARY KEY,
    group_id    INTEGER NOT NULL REFERENCES groups(id),
    title       TEXT NOT NULL,
    composer    TEXT,
    key         TEXT,                        -- ex: "Dm", "Bb"
    release_year          INTEGER,           -- année de sortie / composition d'origine
    original_artist       TEXT,              -- artiste/groupe d'origine si reprise (distinct de `composer`)
    reference_duration_s  INTEGER,           -- durée cible/de référence, en secondes
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
    type        TEXT NOT NULL DEFAULT 'repetition',
                                             -- repetition | concert | studio | autre
    title       TEXT,
    location    TEXT,
    notes       TEXT,
    members     TEXT[],                      -- ["Marc", "Julie", "Thomas"]
    created_by  TEXT NOT NULL,
    created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE recordings (
    id          SERIAL PRIMARY KEY,
    session_id  INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
    song_id     INTEGER REFERENCES songs(id),
    take        INTEGER NOT NULL DEFAULT 1,  -- calculé automatiquement, jamais saisi manuellement
    file_path   TEXT NOT NULL,               -- "{id}.mp3"
    source_file_name TEXT,                   -- nom du fichier tel que déposé, pour l'affichage
                                             -- NULL pour les prises antérieures à la migration 023
    duration_s  INTEGER,
    status      TEXT DEFAULT 'À revoir',      -- qualité libre : 'À revoir' | 'Moyen' | 'Bon' | 'Référence' | texte court personnalisé
    file_hash   TEXT,
    notes       TEXT,
    uploaded_by TEXT NOT NULL,
    uploaded_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ DEFAULT now(),
    UNIQUE (session_id, song_id, take)
);

-- Calcul du take à l'upload (dans une transaction) :
-- SELECT COALESCE(MAX(take), 0) + 1 FROM recordings WHERE session_id = $1 AND song_id = $2;

CREATE TABLE comments (
    id           SERIAL PRIMARY KEY,
    recording_id INTEGER REFERENCES recordings(id) ON DELETE CASCADE,
    author       TEXT NOT NULL,
    author_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    content      TEXT NOT NULL,
    timestamp_s  FLOAT,                      -- null = commentaire global
    created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE comment_reactions (
    comment_id  INTEGER REFERENCES comments(id) ON DELETE CASCADE,
    user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
    value       SMALLINT NOT NULL CHECK (value IN (-1, 1)),  -- 1 = pouce haut, -1 = pouce bas
    created_at  TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (comment_id, user_id)
);

CREATE TABLE playlists (
    id          SERIAL PRIMARY KEY,
    group_id    INTEGER NOT NULL REFERENCES groups(id),
    name        TEXT NOT NULL,
    description TEXT,
    created_by  TEXT NOT NULL,
    created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
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

CREATE TABLE calendar_events (
    id          SERIAL PRIMARY KEY,
    group_id    INTEGER REFERENCES groups(id) ON DELETE CASCADE,
                                             -- NULL pour les indisponibilités personnelles
    user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
                                             -- auteur réel de l'événement (et propriétaire des indisponibilités)
    date        DATE NOT NULL,
    type        TEXT NOT NULL CHECK (type IN ('indisponibilite', 'repetition', 'concert', 'studio', 'autre')),
                                             -- les 4 derniers reflètent sessions.type
    author      TEXT NOT NULL,
    title       TEXT,
    notes       TEXT,
    location    TEXT,
    session_id  INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE notifications (
    id            SERIAL PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,   -- destinataire
    group_id      INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    type          TEXT NOT NULL CHECK (type IN ('recording', 'comment', 'session', 'playlist', 'agenda')),
    actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                                                 -- auteur de l'action ; jamais destinataire de la sienne
    actor_name    TEXT NOT NULL,                 -- repli si le compte a disparu
    subject       TEXT,                          -- morceau, nom de playlist, titre de session...
    excerpt       TEXT,                          -- extrait tronque a l'ecriture
    link          TEXT NOT NULL,                 -- cible dans l'application
    -- Une notification disparait avec le contenu qu'elle annonce.
    session_id    INTEGER REFERENCES sessions(id)   ON DELETE CASCADE,
    recording_id  INTEGER REFERENCES recordings(id) ON DELETE CASCADE,
    playlist_id   INTEGER REFERENCES playlists(id)  ON DELETE CASCADE,
    read_at       TIMESTAMPTZ,                   -- NULL = non lue
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Zone de transit des outils audio d'apres upload (decoupe sur les silences).
-- Un import est un fichier deja depose mais pas encore devenu des prises : il vit le
-- temps de la decoupe, puis disparait. Les octets n'habitent PAS AUDIO_DIR, que Caddy
-- sert tel quel sous /audio/ sans passer par Node -- voir src/lib/server/imports.ts.
-- Deux fichiers par import : l'ORIGINAL intact, dans lequel les prises sont taillees,
-- et un proxy leger qui porte l'analyse et la preecoute.
CREATE TABLE audio_imports (
    id          UUID PRIMARY KEY,
    group_id    INTEGER NOT NULL REFERENCES groups(id)   ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    session_id  INTEGER          REFERENCES sessions(id) ON DELETE CASCADE,
                                                 -- session qui recevra les prises
    file_name   TEXT NOT NULL,                   -- nom d'origine, pour l'affichage
    source_mime TEXT,                            -- type de l'original conserve
    file_hash   TEXT NOT NULL,                   -- SHA-256 de la source, comme recordings.file_hash
    duration_s  INTEGER,
    consumed_at TIMESTAMPTZ,                     -- verrou : une decoupe ne se valide qu'une fois
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_songs_group_id     ON songs(group_id);
CREATE INDEX idx_sessions_group_id  ON sessions(group_id);
CREATE INDEX idx_playlists_group_id ON playlists(group_id);
CREATE INDEX idx_user_groups_user   ON user_groups(user_id);
CREATE INDEX idx_user_groups_group  ON user_groups(group_id);
CREATE INDEX idx_recordings_file_hash ON recordings(file_hash);
CREATE INDEX idx_calendar_events_group_date ON calendar_events(group_id, date);
CREATE INDEX idx_calendar_events_user ON calendar_events(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_comment_reactions_comment ON comment_reactions(comment_id);
CREATE INDEX idx_sessions_created_by_user ON sessions(created_by_user_id) WHERE created_by_user_id IS NOT NULL;
CREATE INDEX idx_recordings_uploaded_by_user ON recordings(uploaded_by_user_id) WHERE uploaded_by_user_id IS NOT NULL;
CREATE INDEX idx_comments_author_user ON comments(author_user_id) WHERE author_user_id IS NOT NULL;
CREATE INDEX idx_playlists_created_by_user ON playlists(created_by_user_id) WHERE created_by_user_id IS NOT NULL;
CREATE INDEX idx_notifications_recipient ON notifications(user_id, group_id, created_at DESC);
CREATE INDEX idx_notifications_unread    ON notifications(user_id, group_id) WHERE read_at IS NULL;
CREATE INDEX idx_audio_imports_owner  ON audio_imports(user_id, created_at DESC);
