-- Migration 046 : photo de profil et instruments joués
--
-- Jusqu'ici, un membre n'est qu'un nom et ses initiales. Il peut désormais déposer une
-- photo, et dire ce qu'il joue dans chacun de ses groupes.
--
-- La photo vit en base, comme une pochette : elle suit le compte dans pg_dump et part avec
-- lui (ON DELETE CASCADE). Table à part pour que `SELECT u.*` ne remonte jamais les octets.
-- L'original n'est pas gardé : l'envoi est recadré en carré et réencodé en deux JPEG.
--
-- Les instruments sont par groupe, pas par compte : on joue de la basse dans l'un et on
-- chante dans l'autre. Ils vivent donc sur l'appartenance (user_groups), et partent avec elle.

CREATE TABLE user_avatars (
    user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    image       BYTEA NOT NULL,                 -- JPEG carré 256 px (profil)
    thumbnail   BYTEA NOT NULL,                 -- JPEG carré 96 px (barre du haut, fil, commentaires)
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
                                                -- sert aussi de version dans l'URL, pour le cache
);

ALTER TABLE user_groups
    ADD COLUMN instruments TEXT[] NOT NULL DEFAULT '{}';
