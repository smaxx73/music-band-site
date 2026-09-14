-- Migration 027 : édition des commentaires
-- Un commentaire modifié l'affiche : une réaction 👍/👎 posée avant la modification
-- portait sur un autre texte, le lecteur doit pouvoir le savoir.

ALTER TABLE comments ADD COLUMN edited_at TIMESTAMPTZ;  -- NULL = jamais modifié
