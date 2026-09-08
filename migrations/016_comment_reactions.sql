-- 016_comment_reactions.sql
-- Réactions (pouce haut / pouce bas) des membres sur les commentaires d'une prise.
-- Une seule réaction par utilisateur et par commentaire : re-cliquer la retire,
-- cliquer l'autre pouce la remplace.

CREATE TABLE IF NOT EXISTS comment_reactions (
    comment_id  INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    value       SMALLINT NOT NULL CHECK (value IN (-1, 1)),  -- 1 = 👍, -1 = 👎
    created_at  TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_comment_reactions_comment ON comment_reactions(comment_id);
