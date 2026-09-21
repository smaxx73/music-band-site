-- Migration 032 : réactions sur les publications
--
-- Sur le fil d'actualité, un pouce est le moyen le plus léger de dire « vu, et j'aime » :
-- sans lui, il faudrait écrire un commentaire pour chaque vidéo ou idée partagée.
-- Même forme que comment_reactions : une réaction par membre, re-cliquer la retire.
-- Seules les publications en portent — une session ou une prise n'appelle pas ce signal.

CREATE TABLE post_reactions (
    post_id     INTEGER REFERENCES posts(id) ON DELETE CASCADE,
    user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
    value       SMALLINT NOT NULL CHECK (value IN (-1, 1)),  -- 1 = pouce haut, -1 = pouce bas
    created_at  TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (post_id, user_id)
);
