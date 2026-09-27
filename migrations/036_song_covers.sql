-- Migration 036 : pochette d'un morceau
--
-- Jusqu'ici, la pochette d'un morceau est un dégradé généré (teinte tirée de l'id). Tout
-- membre du groupe peut désormais en déposer une vraie.
--
-- Comme le logo de groupe, l'image vit en base : elle suit le morceau dans pg_dump et part
-- avec lui (ON DELETE CASCADE, donc aussi à la suppression du groupe). Table à part pour
-- que `SELECT s.*` ne remonte jamais les octets.
--
-- L'original n'est pas gardé : l'envoi est recadré en carré et réencodé en deux JPEG, un
-- pour les en-têtes, un pour les listes. Une photo de téléphone de plusieurs Mo n'a rien à
-- faire en base pour s'afficher en 44 px.

CREATE TABLE song_covers (
    song_id             INTEGER PRIMARY KEY REFERENCES songs(id) ON DELETE CASCADE,
    image               BYTEA NOT NULL,         -- JPEG carré 512 px (en-têtes)
    thumbnail           BYTEA NOT NULL,         -- JPEG carré 160 px (listes, mini-lecteur)
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
                                                -- sert aussi de version dans l'URL, pour le cache
    updated_by_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL
);
