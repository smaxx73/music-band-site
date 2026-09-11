-- 021_group_profile.sql
-- Identité publique d'un groupe : logo et liens vers ses réseaux (YouTube, Facebook,
-- Instagram). Modifiables par l'admin du groupe (canManageGroup), comme son nom.

ALTER TABLE groups
    ADD COLUMN youtube_url   TEXT,
    ADD COLUMN facebook_url  TEXT,
    ADD COLUMN instagram_url TEXT;

-- Le logo vit en base plutôt que sur disque : quelques centaines de Ko au plus, il
-- suit ainsi le groupe dans le dump pg_dump (seule sauvegarde restaurable telle quelle)
-- et disparaît avec lui sans fichier orphelin. Table à part pour que les `SELECT g.*`
-- sur groups ne remontent jamais les octets de l'image.
CREATE TABLE group_logos (
    group_id    INTEGER PRIMARY KEY REFERENCES groups(id) ON DELETE CASCADE,
    mime_type   TEXT NOT NULL CHECK (mime_type IN ('image/png', 'image/jpeg', 'image/webp', 'image/gif')),
                                             -- pas de SVG : servi depuis notre origine, il pourrait exécuter du script
    data        BYTEA NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
                                             -- sert aussi de version dans l'URL, pour le cache navigateur
);
