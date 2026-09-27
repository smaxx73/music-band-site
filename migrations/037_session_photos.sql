-- Migration 037 : photo de bandeau d'une session
--
-- L'en-tête d'une session est un bandeau teinté par son type. Tout membre du groupe peut
-- désormais y poser une photo (la salle, la scène, le groupe en répétition).
--
-- Comme la pochette d'un morceau, l'image vit en base : elle suit la session dans pg_dump
-- et part avec elle (ON DELETE CASCADE, donc aussi à la suppression du groupe). Table à
-- part pour que `SELECT s.*` ne remonte jamais les octets.
--
-- L'original n'est pas gardé : l'envoi est recadré au centre au format du bandeau et
-- réencodé en JPEG, sans ses métadonnées (EXIF, position GPS).

CREATE TABLE session_photos (
    session_id          INTEGER PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
    image               BYTEA NOT NULL,         -- JPEG 1600 × 600, recadré au centre
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
                                                -- sert aussi de version dans l'URL, pour le cache
    updated_by_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL
);
