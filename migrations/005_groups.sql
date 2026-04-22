-- Migration 005 : support multi-groupes

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

ALTER TABLE songs     ADD COLUMN group_id INTEGER REFERENCES groups(id);
ALTER TABLE sessions  ADD COLUMN group_id INTEGER REFERENCES groups(id);
ALTER TABLE playlists ADD COLUMN group_id INTEGER REFERENCES groups(id);

-- Migration des données existantes vers un groupe par défaut
DO $$
DECLARE
    gid INTEGER;
BEGIN
    INSERT INTO groups (name, created_at)
    VALUES ('Groupe Musique Test', now())
    RETURNING id INTO gid;

    UPDATE songs     SET group_id = gid WHERE group_id IS NULL;
    UPDATE sessions  SET group_id = gid WHERE group_id IS NULL;
    UPDATE playlists SET group_id = gid WHERE group_id IS NULL;

    -- Tous les utilisateurs existants rejoignent le groupe
    INSERT INTO user_groups (user_id, group_id, role)
    SELECT u.id, gid, CASE WHEN u.role = 'admin' THEN 'admin' ELSE 'member' END
    FROM users u
    ON CONFLICT DO NOTHING;
END $$;

ALTER TABLE songs     ALTER COLUMN group_id SET NOT NULL;
ALTER TABLE sessions  ALTER COLUMN group_id SET NOT NULL;
ALTER TABLE playlists ALTER COLUMN group_id SET NOT NULL;

CREATE INDEX idx_songs_group_id     ON songs(group_id);
CREATE INDEX idx_sessions_group_id  ON sessions(group_id);
CREATE INDEX idx_playlists_group_id ON playlists(group_id);
CREATE INDEX idx_user_groups_user   ON user_groups(user_id);
CREATE INDEX idx_user_groups_group  ON user_groups(group_id);
