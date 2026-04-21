-- Migration 003 : table utilisateurs avec rôles
-- Remplace le mot de passe partagé AUTH_PASSWORD

CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    name          TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    active        BOOLEAN NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ DEFAULT now()
);

-- Créer le premier administrateur via :
--   npx tsx scripts/create-user.ts --name=<prénom> --password=<motdepasse> --role=admin
-- Ou depuis le conteneur Docker :
--   docker compose exec app npx tsx scripts/create-user.ts --name=<prénom> --password=<motdepasse> --role=admin
