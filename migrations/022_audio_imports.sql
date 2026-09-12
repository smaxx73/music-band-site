-- 022_audio_imports.sql — zone de transit des outils audio d'après upload
--
-- Un import est un fichier déposé mais pas encore devenu des prises : il vit le temps
-- de la découpe, puis disparaît. Les octets n'habitent PAS AUDIO_DIR — en production
-- Caddy sert ce dossier tel quel sous /audio/, sans passer par Node ni par
-- l'authentification (voir src/lib/server/imports.ts).
--
-- Deux fichiers par import : l'ORIGINAL intact, dans lequel les prises seront taillées,
-- et un proxy léger qui porte l'analyse et la préécoute. Le rendu final ne part jamais
-- du proxy.

CREATE TABLE audio_imports (
    id          UUID PRIMARY KEY,
    group_id    INTEGER NOT NULL REFERENCES groups(id)   ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    session_id  INTEGER          REFERENCES sessions(id) ON DELETE CASCADE,
                                             -- session qui recevra les prises, choisie à l'upload
    file_name   TEXT NOT NULL,               -- nom d'origine, seulement pour l'affichage
    source_mime TEXT,                        -- type de l'original conservé, tel que déposé
    file_hash   TEXT NOT NULL,               -- SHA-256 du fichier source, comme recordings.file_hash
    duration_s  INTEGER,
    consumed_at TIMESTAMPTZ,                 -- verrou : une découpe validée ne peut pas l'être deux fois
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audio_imports_owner ON audio_imports(user_id, created_at DESC);
