-- 002 — ajout updated_at sur playlists pour le tri "dernière modification"
ALTER TABLE playlists ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
UPDATE playlists SET updated_at = created_at;
