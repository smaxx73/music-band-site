-- Migration 033 : liens d'écoute publics
--
-- Jusqu'ici, rien ne sortait du groupe : tout lien exigeait un compte. Un lien d'écoute
-- ouvre UN enregistrement à qui le détient, sans compte, pour l'écouter et le
-- télécharger — un programmateur, un ami, un ancien membre.
--
-- Un jeton aléatoire plutôt qu'un drapeau `public` sur la prise : les ids se suivent et
-- se devinent, un jeton non. Une table plutôt qu'un id signé : un lien se révoque seul,
-- sans toucher au secret des sessions.
--
-- Seule l'empreinte du jeton est stockée : il vaut un mot de passe, et une sauvegarde
-- téléchargée ne doit pas publier d'enregistrements. Le lien ne s'affiche donc qu'à sa
-- création ; perdu, il se révoque et se recrée.
--
-- Même forme que `comments_target` : une prise du groupe OU un enregistrement perso.

CREATE TABLE share_links (
    id                    SERIAL PRIMARY KEY,
    token_hash            TEXT NOT NULL UNIQUE,    -- SHA-256 hex du jeton
    recording_id          INTEGER REFERENCES recordings(id)          ON DELETE CASCADE,
    personal_recording_id INTEGER REFERENCES personal_recordings(id) ON DELETE CASCADE,
    created_by_user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at            TIMESTAMPTZ NOT NULL,    -- toujours borné : 6 mois par défaut
    last_accessed_at      TIMESTAMPTZ,             -- dernière ouverture de la page d'écoute
    CONSTRAINT share_links_target CHECK (num_nonnulls(recording_id, personal_recording_id) = 1)
);

CREATE INDEX idx_share_links_recording ON share_links(recording_id) WHERE recording_id IS NOT NULL;
CREATE INDEX idx_share_links_personal  ON share_links(personal_recording_id) WHERE personal_recording_id IS NOT NULL;
