-- Conserver l'auteur comme référence utilisateur permet d'afficher rétroactivement
-- son nom courant, tout en gardant le texte historique comme solution de repli.
ALTER TABLE sessions ADD COLUMN created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE recordings ADD COLUMN uploaded_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE comments ADD COLUMN author_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE playlists ADD COLUMN created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- Les anciennes valeurs auteur correspondaient à l'ancien champ users.name,
-- renommé nickname par la migration 017.
UPDATE sessions s
SET created_by_user_id = u.id
FROM users u
WHERE s.created_by_user_id IS NULL AND s.created_by = u.nickname;

UPDATE recordings r
SET uploaded_by_user_id = u.id
FROM users u
WHERE r.uploaded_by_user_id IS NULL AND r.uploaded_by = u.nickname;

UPDATE comments c
SET author_user_id = u.id
FROM users u
WHERE c.author_user_id IS NULL AND c.author = u.nickname;

UPDATE playlists p
SET created_by_user_id = u.id
FROM users u
WHERE p.created_by_user_id IS NULL AND p.created_by = u.nickname;

-- user_id existait déjà pour les indisponibilités. On complète les événements partagés.
UPDATE calendar_events e
SET user_id = u.id
FROM users u
WHERE e.user_id IS NULL AND e.author = u.nickname;

-- Si des contenus ont été créés entre les migrations 017 et 018, leur auteur
-- contient déjà un nom d'affichage. On ne relie que les correspondances non ambiguës.
UPDATE sessions s
SET created_by_user_id = u.id
FROM (SELECT display_name, MIN(id) AS id FROM users GROUP BY display_name HAVING COUNT(*) = 1) u
WHERE s.created_by_user_id IS NULL AND s.created_by = u.display_name;

UPDATE recordings r
SET uploaded_by_user_id = u.id
FROM (SELECT display_name, MIN(id) AS id FROM users GROUP BY display_name HAVING COUNT(*) = 1) u
WHERE r.uploaded_by_user_id IS NULL AND r.uploaded_by = u.display_name;

UPDATE comments c
SET author_user_id = u.id
FROM (SELECT display_name, MIN(id) AS id FROM users GROUP BY display_name HAVING COUNT(*) = 1) u
WHERE c.author_user_id IS NULL AND c.author = u.display_name;

UPDATE playlists p
SET created_by_user_id = u.id
FROM (SELECT display_name, MIN(id) AS id FROM users GROUP BY display_name HAVING COUNT(*) = 1) u
WHERE p.created_by_user_id IS NULL AND p.created_by = u.display_name;

UPDATE calendar_events e
SET user_id = u.id
FROM (SELECT display_name, MIN(id) AS id FROM users GROUP BY display_name HAVING COUNT(*) = 1) u
WHERE e.user_id IS NULL AND e.author = u.display_name;

CREATE INDEX idx_sessions_created_by_user ON sessions(created_by_user_id) WHERE created_by_user_id IS NOT NULL;
CREATE INDEX idx_recordings_uploaded_by_user ON recordings(uploaded_by_user_id) WHERE uploaded_by_user_id IS NOT NULL;
CREATE INDEX idx_comments_author_user ON comments(author_user_id) WHERE author_user_id IS NOT NULL;
CREATE INDEX idx_playlists_created_by_user ON playlists(created_by_user_id) WHERE created_by_user_id IS NOT NULL;
