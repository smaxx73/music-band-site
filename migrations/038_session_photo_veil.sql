-- Migration 038 : intensité du voile sombre sur la photo de bandeau d'une session
--
-- Le voile qui garde le titre lisible était fixe. Une photo déjà sombre s'en passe presque,
-- une photo claire en demande davantage : il se règle désormais depuis l'édition de la
-- session. Pourcentage d'opacité au bord gauche du bandeau ; 75 reproduit le voile d'origine.
-- Le plancher (20) garde le texte clair lisible — voir src/lib/session-photo.ts.

ALTER TABLE session_photos
    ADD COLUMN veil SMALLINT NOT NULL DEFAULT 75 CHECK (veil BETWEEN 20 AND 95);
